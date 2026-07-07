/* Site editor — commits photo/text changes straight to the GitHub repo
   via the Contents API. Token lives in localStorage only; nothing here
   ever sends it anywhere but api.github.com. */

const OWNER = 'N1KO1a1G0gle';
const REPO = 'Portfolio-Nikolay-';
const BRANCH = 'main';
const TOKEN_KEY = 'gh_admin_token';

const PAGES = [
  { file: 'index.html', label: 'Home' },
  { file: 'gallery.html', label: 'Gallery' },
  { file: 'project.html', label: 'Project — Banking onboarding' },
  { file: 'project-coop.html', label: 'Project — Slow-food cooperative' },
  { file: 'project-magazine.html', label: 'Project — School magazine' },
  { file: 'post.html', label: 'Journal — Low light without a tripod' },
  { file: 'post-sketching.html', label: 'Journal — Sketching on paper' },
  { file: 'post-review.html', label: 'Journal — Year reviewed' },
  { file: 'post-grids.html', label: 'Journal — Paper mill grids' },
];

const SLOT_LABELS = {
  'hero-photo': 'Hero photograph',
  'work1-cover': 'Selected work — project 1 cover',
  'work2-cover': 'Selected work — project 2 cover',
  'work3-cover': 'Selected work — project 3 cover',
  'teaser-01': 'Gallery teaser — photo 1', 'teaser-02': 'Gallery teaser — photo 2',
  'teaser-03': 'Gallery teaser — photo 3', 'teaser-04': 'Gallery teaser — photo 4',
  'teaser-05': 'Gallery teaser — photo 5',
  'about-portrait': 'About — portrait photo',
  'project1-cover': 'Cover image', 'project2-cover': 'Cover image', 'project3-cover': 'Cover image',
  'project1-img1': 'Body photo 1', 'project1-img2': 'Body photo 2', 'project1-img3': 'Body photo 3',
  'project2-img1': 'Body photo 1', 'project2-img2': 'Body photo 2', 'project2-img3': 'Body photo 3',
  'project3-img1': 'Body photo 1', 'project3-img2': 'Body photo 2', 'project3-img3': 'Body photo 3',
  'post1-cover': 'Cover photograph', 'post2-cover': 'Cover photograph',
  'post3-cover': 'Cover photograph', 'post4-cover': 'Cover photograph',
  'post1-img1': 'Inline photograph', 'post2-img1': 'Inline photograph',
  'post3-img1': 'Inline photograph', 'post4-img1': 'Inline photograph',
};
for (let i = 1; i <= 13; i++) {
  SLOT_LABELS[`gallery-${String(i).padStart(2, '0')}`] = `Gallery photo ${i}`;
}

const TEXT_SELECTORS = [
  '.eyebrow', 'h1', '.hero-sub', '.page-sub', '.about-bio', '.gallery-sub',
  '.work-desc', '.work-row h3 a', '.next-cta a', '.contact-email',
  '.journal-row .date', '.journal-row .title',
  '.section-head h2', '#journal h2', '#about h2', '.contact-inner h2',
  '.what-item h3', '.what-item p', '.pull-quote blockquote', '.pull-quote cite a',
  'dd', '.project-body h2', '.project-body p', '.post-body p',
].join(', ');

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

function encPath(path) { return path.split('/').map(encodeURIComponent).join('/'); }

async function gh(path, opts = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.headers || {}),
    },
  });
}

function b64EncodeUnicode(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode('0x' + p1)));
}

function b64DecodeUnicode(b64) {
  return decodeURIComponent(
    atob(b64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
  );
}

async function checkRepoAccess() {
  const res = await gh(`/repos/${OWNER}/${REPO}`);
  return res.ok;
}

async function getFile(path) {
  const res = await gh(`/repos/${OWNER}/${REPO}/contents/${encPath(path)}?ref=${BRANCH}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Couldn't load ${path} (${res.status})`);
  const json = await res.json();
  return { sha: json.sha, text: b64DecodeUnicode(json.content) };
}

async function putTextFile(path, text, sha, message) {
  const body = { message, content: b64EncodeUnicode(text), branch: BRANCH };
  if (sha) body.sha = sha;
  const res = await gh(`/repos/${OWNER}/${REPO}/contents/${encPath(path)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.message || `Couldn't save ${path} (${res.status})`);
  }
  return res.json();
}

async function putBinaryFile(path, base64Content, message) {
  const existing = await getFile(path).catch(() => null);
  const body = { message, content: base64Content, branch: BRANCH };
  if (existing) body.sha = existing.sha;
  const res = await gh(`/repos/${OWNER}/${REPO}/contents/${encPath(path)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.message || `Couldn't upload ${path} (${res.status})`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Image resize/compress (keeps uploads under the API's 1MB limit and the
// site fast) — draws to a canvas capped at 1600px on the long edge.
// ---------------------------------------------------------------------------

function resizeImageToBase64(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round((height * maxDim) / width); width = maxDim; }
        else { width = Math.round((width * maxDim) / height); height = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('Image compression failed')); return; }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }, 'image/jpeg', quality);
    };
    img.onerror = () => reject(new Error('Could not read image file'));
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  current: null, // { file, sha, doc, photoFields: [], textFields: [] }
};

function isDirty() {
  if (!state.current) return false;
  const photoDirty = state.current.photoFields.some(f => f.pendingFile);
  const textDirty = state.current.textFields.some(f => f.textarea.value.trim() !== f.original.trim());
  return photoDirty || textDirty;
}

function updateSaveBar() {
  const dirty = isDirty();
  document.getElementById('save-btn').disabled = !dirty;
  const count =
    (state.current ? state.current.photoFields.filter(f => f.pendingFile).length : 0) +
    (state.current ? state.current.textFields.filter(f => f.textarea.value.trim() !== f.original.trim()).length : 0);
  document.getElementById('dirty-count').textContent = count > 0 ? `${count} unsaved change${count === 1 ? '' : 's'}` : '';
}

function showStatus(msg, isError = false) {
  const el = document.getElementById('status-msg');
  el.textContent = msg;
  el.hidden = false;
  el.classList.toggle('is-error', isError);
}

function hideStatus() {
  document.getElementById('status-msg').hidden = true;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

async function renderPage(file) {
  if (isDirty() && !confirm('You have unsaved changes on this page. Discard them?')) {
    document.getElementById('page-select').value = state.current.file;
    return;
  }

  hideStatus();
  const container = document.getElementById('page-content');
  container.innerHTML = '<p class="admin-loading">Loading…</p>';
  document.getElementById('save-btn').disabled = true;
  document.getElementById('dirty-count').textContent = '';

  let loaded;
  try {
    loaded = await getFile(file);
  } catch (err) {
    container.innerHTML = '';
    showStatus(err.message, true);
    return;
  }

  const doc = new DOMParser().parseFromString(loaded.text, 'text/html');
  state.current = { file, sha: loaded.sha, doc, photoFields: [], textFields: [] };

  container.innerHTML = '';

  // Photos ---------------------------------------------------------------
  const slots = doc.querySelectorAll('[data-slot]');
  if (slots.length) {
    const title = document.createElement('h2');
    title.className = 'admin-section-title';
    title.textContent = 'Photos';
    container.appendChild(title);

    slots.forEach(el => {
      const slot = el.getAttribute('data-slot');
      const label = SLOT_LABELS[slot] || slot;
      const existingImg = el.querySelector('img');

      const card = document.createElement('div');
      card.className = 'admin-photo-card';

      const thumb = document.createElement('div');
      thumb.className = 'admin-photo-thumb';
      if (existingImg) {
        const img = document.createElement('img');
        img.src = new URL(existingImg.getAttribute('src'), location.href.replace(/admin\.html.*/, '')).href;
        thumb.appendChild(img);
      } else {
        thumb.textContent = '—';
      }

      const right = document.createElement('div');
      const labelEl = document.createElement('div');
      labelEl.className = 'admin-photo-label';
      labelEl.textContent = label;
      const hint = document.createElement('div');
      hint.className = 'admin-photo-hint';
      hint.textContent = existingImg ? 'Replace this photo' : 'No photo yet — showing placeholder';
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';

      const field = { slot, el, thumbEl: thumb, hintEl: hint, pendingFile: null };

      input.addEventListener('change', () => {
        field.pendingFile = input.files[0] || null;
        if (field.pendingFile) {
          hint.textContent = `Will upload: ${field.pendingFile.name} (resized automatically)`;
          hint.classList.add('is-pending');
          const previewUrl = URL.createObjectURL(field.pendingFile);
          thumb.innerHTML = '';
          const previewImg = document.createElement('img');
          previewImg.src = previewUrl;
          thumb.appendChild(previewImg);
        }
        updateSaveBar();
      });

      right.appendChild(labelEl);
      right.appendChild(hint);
      right.appendChild(input);
      card.appendChild(thumb);
      card.appendChild(right);
      container.appendChild(card);

      state.current.photoFields.push(field);
    });
  }

  // Text -------------------------------------------------------------------
  const main = doc.querySelector('main') || doc.body;
  const textEls = Array.from(main.querySelectorAll(TEXT_SELECTORS)).filter(el => {
    if (el.closest('[data-slot]')) return false;
    return el.textContent.trim().length > 0;
  });

  if (textEls.length) {
    const title = document.createElement('h2');
    title.className = 'admin-section-title';
    title.textContent = 'Text';
    container.appendChild(title);

    textEls.forEach(el => {
      const wrap = document.createElement('div');
      wrap.className = 'admin-text-field';

      const tag = document.createElement('span');
      tag.className = 'admin-text-tag';
      tag.textContent = el.tagName.toLowerCase();

      const textarea = document.createElement('textarea');
      textarea.className = 'admin-textarea';
      const original = el.innerHTML.trim();
      textarea.value = original;
      textarea.rows = Math.min(6, Math.max(1, Math.ceil(original.length / 60)));
      textarea.addEventListener('input', updateSaveBar);

      wrap.appendChild(tag);
      wrap.appendChild(textarea);
      container.appendChild(wrap);

      state.current.textFields.push({ el, original, textarea });
    });
  }

  if (!slots.length && !textEls.length) {
    container.innerHTML = '<p class="admin-loading">Nothing editable found on this page.</p>';
  }

  updateSaveBar();
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

async function saveCurrentPage() {
  if (!state.current || !isDirty()) return;
  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  showStatus('Saving…');

  try {
    // Upload changed photos first, then patch the retained document.
    for (const field of state.current.photoFields) {
      if (!field.pendingFile) continue;
      const base64 = await resizeImageToBase64(field.pendingFile);
      const path = `images/${field.slot}.jpg`;
      await putBinaryFile(path, base64, `Admin: update photo ${field.slot}`);

      field.el.classList.add('has-photo');
      field.el.innerHTML = '';
      const img = state.current.doc.createElement('img');
      img.setAttribute('src', path);
      img.setAttribute('alt', SLOT_LABELS[field.slot] || field.slot);
      img.setAttribute('loading', 'lazy');
      field.el.appendChild(img);
      field.pendingFile = null;
    }

    // Apply changed text directly onto the retained elements.
    for (const field of state.current.textFields) {
      const newValue = field.textarea.value.trim();
      if (newValue !== field.original) {
        field.el.innerHTML = newValue;
        field.original = newValue;
      }
    }

    const html = '<!DOCTYPE html>\n' + state.current.doc.documentElement.outerHTML;
    const result = await putTextFile(state.current.file, html, state.current.sha, `Admin: edit ${state.current.file}`);
    state.current.sha = result.content.sha;

    showStatus('Saved — live in about 30–60 seconds.');
    updateSaveBar();
    // Re-render so thumbnails/hints reflect the freshly saved state.
    await renderPage(state.current.file);
    document.getElementById('page-select').value = state.current.file;
  } catch (err) {
    showStatus(err.message, true);
  } finally {
    updateSaveBar();
  }
}

// ---------------------------------------------------------------------------
// Connect / boot
// ---------------------------------------------------------------------------

function showEditor() {
  document.getElementById('connect-screen').hidden = true;
  document.getElementById('editor-screen').hidden = false;
  const select = document.getElementById('page-select');
  select.innerHTML = PAGES.map(p => `<option value="${p.file}">${p.label}</option>`).join('');
  renderPage(PAGES[0].file);
}

function showConnect(message) {
  document.getElementById('editor-screen').hidden = true;
  document.getElementById('connect-screen').hidden = false;
  const errEl = document.getElementById('connect-error');
  if (message) {
    errEl.textContent = message;
    errEl.hidden = false;
  } else {
    errEl.hidden = true;
  }
}

async function tryConnect(token) {
  setToken(token);
  const ok = await checkRepoAccess();
  if (ok) {
    showEditor();
  } else {
    clearToken();
    showConnect('Could not access the repository with that token. Check it has "Contents: Read and write" on Portfolio-Nikolay- and try again.');
  }
}

document.getElementById('connect-btn').addEventListener('click', () => {
  const token = document.getElementById('token-input').value.trim();
  if (!token) return;
  tryConnect(token);
});

document.getElementById('page-select').addEventListener('change', e => {
  renderPage(e.target.value);
});

document.getElementById('save-btn').addEventListener('click', saveCurrentPage);

document.getElementById('logout-btn').addEventListener('click', () => {
  if (isDirty() && !confirm('You have unsaved changes. Disconnect anyway?')) return;
  clearToken();
  state.current = null;
  showConnect();
});

(async function boot() {
  const existing = getToken();
  if (existing) {
    const ok = await checkRepoAccess().catch(() => false);
    if (ok) { showEditor(); return; }
    clearToken();
    showConnect('Your saved session expired — reconnect with a token.');
  }
})();
