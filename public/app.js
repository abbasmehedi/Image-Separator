let currentImageObj = null;
let currentImageData = null; 
let originalImageData = null; 
let lastProcessedPayload = null; 
let lastProcessResult = null;
let globalBoxSize = 50; 

let isCropMode = false;
let cropRect = null;

const container = document.getElementById('konva-container');

const stage = new Konva.Stage({
  container: 'konva-container',
  width: container.offsetWidth || 1000,
  height: container.offsetHeight || 650,
});

const imageLayer = new Konva.Layer();
const boxLayer = new Konva.Layer();
stage.add(imageLayer);
stage.add(boxLayer);

const cropTransformer = new Konva.Transformer({
  nodes: [],
  keepRatio: false, 
  rotateEnabled: false,
  enabledAnchors: [
    'top-left', 'top-center', 'top-right', 
    'left-center', 'right-center', 
    'bottom-left', 'bottom-center', 'bottom-right'
  ],
});
boxLayer.add(cropTransformer);

function showToast(message, type = 'success') {
  const toastContainer = document.getElementById('toast-container');
  if (!toastContainer) return;

  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.padding = '12px 24px';
  toast.style.borderRadius = '8px';
  toast.style.color = '#ffffff';
  toast.style.fontWeight = 'bold';
  toast.style.fontSize = '1rem';
  toast.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
  toast.style.transition = 'all 0.3s ease';
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(-20px)';
  
  if (type === 'success') {
    toast.style.backgroundColor = '#22c55e';
  } else {
    toast.style.backgroundColor = '#ef4444';
  }

  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-20px)';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 1000);
}

stage.on('click tap', function (e) {
  if (isCropMode) return;
  if (e.target === stage || e.target.id() === 'backgroundImage') {
    boxLayer.draw();
    return;
  }
});

const dropZone = document.getElementById('drop-zone');
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) handleFileSelection(e.dataTransfer.files[0]);
});
document.getElementById('file-input').addEventListener('change', (e) => {
  if (e.target.files.length > 0) handleFileSelection(e.target.files[0]);
});

function showError(msg) {
  showToast(msg, 'error'); 
}

function handleFileSelection(file) {
  document.getElementById('error-message').classList.add('hidden');
  const formData = new FormData();
  formData.append('image', file);

  const pContainer = document.getElementById('progress-container');
  const pBar = document.getElementById('progress-bar');
  pContainer.classList.remove('hidden');
  pBar.style.width = '0%';

  const xhr = new XMLHttpRequest();
  xhr.open('POST', window.location.origin + '/upload', true);

  xhr.upload.onprogress = function (e) {
    if (e.lengthComputable) {
      pBar.style.width = ((e.loaded / e.total) * 100) + '%';
    }
  };

  xhr.onload = function () {
    pContainer.classList.add('hidden');
    if (xhr.status === 200) {
      try {
        const res = JSON.parse(xhr.responseText);
        if (res.success) {
          originalImageData = res; 
          initWorkspace(res);
          showToast("Image uploaded successfully!", "success");
        }
        else showError(res.message);
      } catch (e) { showError("Parsing failed."); }
    } else { showError("Upload failed."); }
  };

  xhr.onerror = function () { pContainer.classList.add('hidden'); showError("Network Error"); };
  xhr.send(formData);
}

function initWorkspace(data) {
  currentImageData = data;
  lastProcessedPayload = null;
  globalBoxSize = 50; 
  isCropMode = false;
  if (cropRect) { cropRect.destroy(); cropRect = null; }
  cropTransformer.nodes([]);
  document.getElementById('box-global-size').value = 50;
  
  boxLayer.find('.boxGroup').forEach(b => b.destroy());
  boxLayer.draw();

  const img = new Image();
  img.src = data.imageUrl; 
  img.onload = function () {
    if (currentImageObj) currentImageObj.destroy();
    currentImageObj = new Konva.Image({ x: 0, y: 0, image: img, width: data.width, height: data.height, id: 'backgroundImage' });

    imageLayer.destroyChildren();
    imageLayer.add(currentImageObj);
    imageLayer.x(0).y(0).rotation(0);
    boxLayer.x(0).y(0).rotation(0);

    boxLayer.moveToTop();
    cropTransformer.moveToTop();

    document.getElementById('workspace-area').classList.remove('hidden');
    document.getElementById('results-area').classList.add('hidden');
    document.getElementById('upload-area').classList.add('hidden');

    requestAnimationFrame(() => {
      stage.width(container.offsetWidth || 1000);
      stage.height(container.offsetHeight || 650);
      fitToScreen();
      stage.batchDraw();
    });
  };
}

function fitToScreen() {
  if (!currentImageData) return;
  const pad = 40; 
  const cw = container.offsetWidth - pad; 
  const ch = container.offsetHeight - pad;
  const w = currentImageData.width;
  const h = currentImageData.height;
  
  const scale = Math.min(cw / w, ch / h, 1);
  stage.scale({ x: scale, y: scale });
  stage.x((container.offsetWidth - w * scale) / 2); 
  stage.y((container.offsetHeight - h * scale) / 2);
  
  boxLayer.moveToTop();
  stage.batchDraw();
}

function updateZoom(factor) {
  const oldScale = stage.scaleX();
  stage.scale({ x: Math.max(0.05, Math.min(oldScale * factor, 30)), y: Math.max(0.05, Math.min(oldScale * factor, 30)) });
  stage.batchDraw();
}

//stage.on('wheel', (e) => { e.evt.preventDefault(); updateZoom(e.evt.deltaY < 0 ? 1.1 : 0.9); });

let isMouseDown = false;

stage.on('mousedown touchstart', (e) => {
  isMouseDown = true;
  if (e.target === stage || e.target.id() === 'backgroundImage') {
    isDraggingStage = true; 
    lastPos = { x: e.evt.clientX || e.evt.touches[0].clientX, y: e.evt.clientY || e.evt.touches[0].clientY };
  }
});

stage.on('mouseup touchend', () => { 
  isMouseDown = false; 
  isDraggingStage = false; 
});

stage.on('wheel', (e) => {
  if (e.evt.shiftKey) {
    e.evt.preventDefault();
    updateZoom(e.evt.deltaY < 0 ? 1.1 : 0.9);
  }
});

let isDraggingStage = false; let lastPos = { x: 0, y: 0 };
stage.on('mousedown touchstart', (e) => {
  if (e.target === stage || e.target.id() === 'backgroundImage') {
    isDraggingStage = true; lastPos = { x: e.evt.clientX || e.evt.touches[0].clientX, y: e.evt.clientY || e.evt.touches[0].clientY };
  }
});
stage.on('mousemove touchmove', (e) => {
  if (!isDraggingStage) return;
  const clientX = e.evt.clientX || (e.evt.touches ? e.evt.touches[0].clientX : 0);
  const clientY = e.evt.clientY || (e.evt.touches ? e.evt.touches[0].clientY : 0);
  stage.x(stage.x() + (clientX - lastPos.x)); stage.y(stage.y() + (clientY - lastPos.y));
  stage.batchDraw(); lastPos = { x: clientX, y: clientY };
});
stage.on('mouseup touchend', () => { isDraggingStage = false; });

document.getElementById('btn-zoom-in').addEventListener('click', () => updateZoom(1.2));
document.getElementById('btn-zoom-out').addEventListener('click', () => updateZoom(0.8));
document.getElementById('btn-fit').addEventListener('click', fitToScreen);
document.getElementById('btn-arrange-boxes').addEventListener('click', () => { if(!isCropMode) generateBoxes(); });
document.getElementById('btn-clear-boxes').addEventListener('click', () => { if(!isCropMode) { boxLayer.find('.boxGroup').forEach(b=>b.destroy()); boxLayer.draw(); } });

document.getElementById('box-global-size').addEventListener('input', (e) => {
  if (isCropMode) return;
  let val = parseInt(e.target.value) || 25; if (val < 25) val = 25; globalBoxSize = val;
  boxLayer.find('.boxGroup').forEach(group => {
    const rect = group.findOne('.rect'); const text = group.findOne('.text');
    rect.width(globalBoxSize); rect.height(globalBoxSize); text.width(globalBoxSize); text.height(globalBoxSize);
    text.fontSize(Math.max(12, globalBoxSize * 0.25)); constrainBounds(group);
  });
  boxLayer.draw();
});

function defaultCropRect() {
  return {
    x: currentImageData.width * 0.2, y: currentImageData.height * 0.2,
    width: currentImageData.width * 0.6, height: currentImageData.height * 0.6,
    fill: 'rgba(217, 119, 6, 0.15)', stroke: '#d97706', strokeWidth: 3, dash: [6, 6], draggable: true, id: 'cropRect'
  };
}

document.getElementById('btn-crop-mode').addEventListener('click', () => {
  const applyBtn = document.getElementById('btn-crop-apply');
  const resetBtn = document.getElementById('btn-crop-reset');
  const cropModeBtn = document.getElementById('btn-crop-mode');
  if (!isCropMode) {
    isCropMode = true; cropModeBtn.textContent = "❌ Cancel Crop"; applyBtn.classList.remove('hidden'); resetBtn.classList.remove('hidden');
    boxLayer.find('.boxGroup').forEach(b => b.destroy());
    cropRect = new Konva.Rect(defaultCropRect());
    boxLayer.add(cropRect); cropTransformer.nodes([cropRect]); boxLayer.draw();
  } else {
    isCropMode = false; cropModeBtn.textContent = "✂️ Crop Image"; applyBtn.classList.add('hidden'); resetBtn.classList.add('hidden');
    if (cropRect) { cropRect.destroy(); cropRect = null; }
    cropTransformer.nodes([]); boxLayer.draw();
  }
});

document.getElementById('btn-crop-reset').addEventListener('click', () => {
  if (!originalImageData) return;
  isCropMode = false;
  document.getElementById('btn-crop-apply').classList.add('hidden');
  document.getElementById('btn-crop-reset').classList.add('hidden');
  document.getElementById('btn-crop-mode').textContent = "✂️ Crop Image";
  if (cropRect) { cropRect.destroy(); cropRect = null; }
  cropTransformer.nodes([]);
  initWorkspace(originalImageData);
  showToast("Reverted to initial image successfully!", "success");
});

document.getElementById('btn-crop-apply').addEventListener('click', async () => {
  if (!cropRect) return;
  const payload = {
    imageUrl: currentImageData.imageUrl,
    left: Math.round(Math.max(0, cropRect.x())), top: Math.round(Math.max(0, cropRect.y())),
    width: Math.round(cropRect.width() * cropRect.scaleX()), height: Math.round(cropRect.height() * cropRect.scaleY())
  };
  try {
    const res = await fetch(window.location.origin + '/crop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (data.success) { 
      document.getElementById('btn-crop-apply').classList.add('hidden'); 
      document.getElementById('btn-crop-reset').classList.add('hidden'); 
      document.getElementById('btn-crop-mode').textContent = "✂️ Crop Image"; 
      initWorkspace(data); 
      showToast("Image cropped successfully!", "success");
    }
    else { showError(data.message || "Crop failed."); }
  } catch (err) { showError("Crop server error."); }
});

function generateBoxes() {
  if (!currentImageData || isCropMode) return;
  boxLayer.find('.boxGroup').forEach(b => b.destroy());
  
  const imgW = currentImageData.width; 
  const imgH = currentImageData.height;
  const rowLayout = [5, 4, 4, 4, 5, 5, 5]; 
  const totalRows = rowLayout.length; 
  const rowH = imgH / totalRows;
  
  const maxCols = 5;
  const colW = imgW / maxCols;
  
  let autoSize = Math.min(colW, rowH) * 0.75; 
  if (autoSize < 25) autoSize = 25;
  globalBoxSize = Math.round(autoSize); 
  document.getElementById('box-global-size').value = globalBoxSize;

  let index = 1;
  for (let r = 0; r < totalRows; r++) {
    const colsInThisRow = rowLayout[r];
    for (let c = 0; c < colsInThisRow; c++) {
      createBox(c * colW + (colW - globalBoxSize) / 2, r * rowH + (rowH - globalBoxSize) / 2, globalBoxSize, index++);
    }
  }
  
  boxLayer.moveToTop(); 
  cropTransformer.moveToTop(); 
  boxLayer.draw(); 
  stage.batchDraw();
}

function createBox(x, y, size, index) {
  const group = new Konva.Group({ x: x, y: y, draggable: true, name: 'boxGroup', id: 'box-' + index });
  group.setAttr('boxIndex', index);
  const rect = new Konva.Rect({ width: size, height: size, fill: 'rgba(37, 99, 235, 0.25)', stroke: '#2563eb', strokeWidth: 2, name: 'rect' });
  const text = new Konva.Text({ text: index.toString(), fontSize: Math.max(12, size * 0.25), fontStyle: 'bold', fill: '#ffffff', align: 'center', verticalAlign: 'middle', width: size, height: size, name: 'text' });
  group.add(rect); group.add(text); 
  
  group.on('dragstart', () => {
    group.moveToTop();
  });
  
  group.on('dragmove', () => constrainBounds(group)); 
  boxLayer.add(group);
}

function constrainBounds(group) {
  const imgW = currentImageData.width; const imgH = currentImageData.height;
  const rect = group.findOne('.rect'); const w = rect.width();
  let x = group.x(); let y = group.y();
  if (x < 0) x = 0; if (y < 0) y = 0;
  if (x + w > imgW) x = imgW - w; if (y + w > imgH) y = imgH - w;
  group.x(x); group.y(y);
}

document.getElementById('btn-process').addEventListener('click', async () => {
  const boxes = boxLayer.find('.boxGroup');
  if (boxes.length !== 32) { showError("Error: Click 'Add Boxes' first."); return; }
  const boxesPayload = boxes.map(g => {
    const rect = g.findOne('.rect');
    return { index: g.getAttr('boxIndex'), left: g.x(), top: g.y(), width: rect.width(), height: rect.height() };
  });
  boxesPayload.sort((a, b) => a.index - b.index);
  lastProcessedPayload = { imageUrl: currentImageData.imageUrl, boxes: boxesPayload };
  try {
    const res = await fetch(window.location.origin + '/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lastProcessedPayload) });
    const data = await res.json(); 
    if (data.success) { 
      displayResults(data); 
      showToast("Images processed successfully!", "success");
    } else { showError(data.message); }
  } catch (err) { showError("Processing server error."); }
});

function displayResults(data) {
  lastProcessResult = data;
  const summaryPanel = document.getElementById('summary-panel');
  summaryPanel.innerHTML = `<div class="summary-item">Total Boxes: <strong>${data.generated}</strong></div><div class="summary-item">Status: <strong style="color: var(--accent)">Preview Mode</strong></div>`;
  const grid = document.getElementById('preview-grid'); grid.innerHTML = '';
  data.files.forEach(f => {
    const card = document.createElement('div'); card.className = 'preview-card';
    card.innerHTML = `<span>Box #${f.index}</span><img src="${f.preview}"><p>Preview Mode</p>`; grid.appendChild(card);
  });
  document.getElementById('results-area').classList.remove('hidden'); document.getElementById('results-area').scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('btn-save').addEventListener('click', async () => {
  if (!lastProcessResult) return;
  const saveBtn = document.getElementById('btn-save');
  const originalText = saveBtn.textContent;

  if (!window.showDirectoryPicker) {
    showToast("Folder Picker unsupported. Downloading ZIP package.", "error"); 
    return downloadAsZip();
  }

  let dirHandle;
  try {
    dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch (err) {
    return; 
  }

  try {
    saveBtn.textContent = "Saving...";
    saveBtn.disabled = true;

    for (const file of lastProcessResult.files) {
      const subDirHandle = await dirHandle.getDirectoryHandle(file.index.toString(), { create: true });
      const fileHandle = await subDirHandle.getFileHandle(file.filename, { create: true });
      const writable = await fileHandle.createWritable();
      const blob = await (await fetch(file.preview)).blob(); 
      await writable.write(blob);
      await writable.close();
    }

    showToast(`Saved 32 images into "${dirHandle.name}"!`, "success");
    setTimeout(() => { window.location.reload(); }, 1100);
  } catch (err) {
    console.error(err);
    showError("Folder operation failed: " + err.message);
  } finally {
    saveBtn.textContent = originalText;
    saveBtn.disabled = false;
  }
});

async function downloadAsZip() {
  if (!lastProcessedPayload) return;
  try {
    const res = await fetch(window.location.origin + '/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lastProcessedPayload) });
    if (!res.ok) throw new Error("Download failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'image_separator_output.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("ZIP downloaded successfully!", "success");
    setTimeout(() => { window.location.reload(); }, 1100);
  } catch (err) {
    showError("ZIP download failed.");
  }
}

function resetAppToInitialState() {
  currentImageObj = null; currentImageData = null; originalImageData = null; lastProcessedPayload = null; lastProcessResult = null; isCropMode = false;
  if (cropRect) { cropRect.destroy(); cropRect = null; }
  cropTransformer.nodes([]); boxLayer.destroyChildren(); imageLayer.destroyChildren();
  document.getElementById('upload-area').classList.remove('hidden'); document.getElementById('workspace-area').classList.add('hidden'); document.getElementById('results-area').classList.add('hidden');
  document.getElementById('file-input').value = ""; 
}

window.addEventListener('resize', () => { 
  stage.width(container.offsetWidth || 1000); 
  stage.height(container.offsetHeight || 650);
  if (currentImageData) fitToScreen(); 
});