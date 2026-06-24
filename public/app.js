let currentImageObj = null;
let currentImageData = null; 
let rotationAngle = 0; 
let lastProcessedPayload = null; 
let globalBoxSize = 50; 

let isCropMode = false;
let cropRect = null;

const container = document.getElementById('konva-container');
const stage = new Konva.Stage({
  container: 'konva-container',
  width: container.offsetWidth || 1000,
  height: 600,
});

const imageLayer = new Konva.Layer();
const boxLayer = new Konva.Layer();
stage.add(imageLayer);
stage.add(boxLayer);

const cropTransformer = new Konva.Transformer({
  nodes: [],
  keepRatio: false, 
  rotateEnabled: false,
  enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top-center', 'bottom-center', 'left-center', 'right-center'],
});
boxLayer.add(cropTransformer);

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
  const errEl = document.getElementById('error-message');
  errEl.textContent = msg;
  errEl.classList.remove('hidden');
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
        if (res.success) initWorkspace(res);
        else showError(res.message);
      } catch (e) { showError("Parsing failed."); }
    } else { showError("Upload failed."); }
  };

  xhr.onerror = function () { pContainer.classList.add('hidden'); showError("Network Error"); };
  xhr.send(formData);
}

function initWorkspace(data) {
  currentImageData = data;
  rotationAngle = 0;
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
    
    currentImageObj = new Konva.Image({ 
      x: 0, 
      y: 0, 
      image: img, 
      width: data.width, 
      height: data.height, 
      id: 'backgroundImage' 
    });

    imageLayer.destroyChildren();
    imageLayer.add(currentImageObj);
    imageLayer.x(0).y(0).rotation(0);
    boxLayer.x(0).y(0).rotation(0);

    boxLayer.moveToTop();
    cropTransformer.moveToTop();

    document.getElementById('workspace-area').classList.remove('hidden');
    document.getElementById('results-area').classList.add('hidden');
    document.getElementById('upload-area').classList.add('hidden');

    fitToScreen(); 
    stage.batchDraw();
  };
}

function fitToScreen() {
  if (!currentImageData) return;
  const pad = 40; const cw = container.offsetWidth - pad; const ch = container.offsetHeight - pad;
  const isRotatedOdd = (rotationAngle % 180 !== 0);
  const w = isRotatedOdd ? currentImageData.height : currentImageData.width;
  const h = isRotatedOdd ? currentImageData.width : currentImageData.height;
  const scale = Math.min(cw / w, ch / h, 1);
  stage.scale({ x: scale, y: scale });
  stage.x((container.offsetWidth - w * scale) / 2); stage.y((container.offsetHeight - h * scale) / 2);
  applyRotationCoordinates();
}

function updateZoom(factor) {
  const oldScale = stage.scaleX();
  stage.scale({ x: Math.max(0.05, Math.min(oldScale * factor, 30)), y: Math.max(0.05, Math.min(oldScale * factor, 30)) });
  stage.batchDraw();
}

stage.on('wheel', (e) => { e.evt.preventDefault(); updateZoom(e.evt.deltaY < 0 ? 1.1 : 0.9); });

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
document.getElementById('btn-rot-left').addEventListener('click', () => rotate(-90));
document.getElementById('btn-rot-right').addEventListener('click', () => rotate(90));
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

document.getElementById('btn-crop-mode').addEventListener('click', () => {
  const applyBtn = document.getElementById('btn-crop-apply');
  const cropModeBtn = document.getElementById('btn-crop-mode');
  if (!isCropMode) {
    isCropMode = true; cropModeBtn.textContent = "❌ Cancel Crop"; applyBtn.classList.remove('hidden');
    boxLayer.find('.boxGroup').forEach(b => b.destroy());
    cropRect = new Konva.Rect({
      x: currentImageData.width * 0.2, y: currentImageData.height * 0.2,
      width: currentImageData.width * 0.6, height: currentImageData.height * 0.6,
      fill: 'rgba(217, 119, 6, 0.15)', stroke: '#d97706', strokeWidth: 3, dash: [6, 6], draggable: true, id: 'cropRect'
    });
    boxLayer.add(cropRect); cropTransformer.nodes([cropRect]); boxLayer.draw();
  } else {
    isCropMode = false; cropModeBtn.textContent = "✂️ Crop Image"; applyBtn.classList.add('hidden');
    if (cropRect) { cropRect.destroy(); cropRect = null; }
    cropTransformer.nodes([]); boxLayer.draw();
  }
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
    if (data.success) { document.getElementById('btn-crop-apply').classList.add('hidden'); document.getElementById('btn-crop-mode').textContent = "✂️ Crop Image"; initWorkspace(data); }
    else { alert(data.message || "Crop failed."); }
  } catch (err) { alert("Crop error."); }
});

function rotate(angleShift) {
  rotationAngle = (rotationAngle + angleShift) % 360; if (rotationAngle < 0) rotationAngle += 360;
  applyRotationCoordinates(); fitToScreen();
}

function applyRotationCoordinates() {
  if (!currentImageObj) return;
  const w = currentImageData.width; const h = currentImageData.height;
  if (rotationAngle === 0) { imageLayer.x(0).y(0).rotation(0); boxLayer.x(0).y(0).rotation(0); }
  else if (rotationAngle === 90) { imageLayer.x(w).y(0).rotation(90); boxLayer.x(w).y(0).rotation(90); }
  else if (rotationAngle === 180) { imageLayer.x(w).y(h).rotation(180); boxLayer.x(w).y(h).rotation(180); }
  else if (rotationAngle === 270) { imageLayer.x(0).y(h).rotation(270); boxLayer.x(0).y(h).rotation(270); }
  stage.batchDraw();
}

function generateBoxes() {
  if (!currentImageData || isCropMode) return;
  boxLayer.find('.boxGroup').forEach(b => b.destroy());
  const imgW = currentImageData.width; const imgH = currentImageData.height;
  const rowLayout = [5, 4, 4, 4, 5, 5, 5]; const totalRows = rowLayout.length; const rowH = imgH / totalRows;
  
  let autoSize = Math.min(imgW / 5, rowH) * 0.75; if (autoSize < 25) autoSize = 25;
  globalBoxSize = Math.round(autoSize); document.getElementById('box-global-size').value = globalBoxSize;

  let index = 1;
  for (let r = 0; r < totalRows; r++) {
    const colsInThisRow = rowLayout[r]; const colW = imgW / colsInThisRow;
    for (let c = 0; c < colsInThisRow; c++) {
      createBox(c * colW + (colW - globalBoxSize) / 2, r * rowH + (rowH - globalBoxSize) / 2, globalBoxSize, index++);
    }
  }
  boxLayer.moveToTop(); cropTransformer.moveToTop(); boxLayer.draw(); stage.batchDraw();
}

function createBox(x, y, size, index) {
  const group = new Konva.Group({ x: x, y: y, draggable: true, name: 'boxGroup', id: 'box-' + index });
  group.setAttr('boxIndex', index);
  const rect = new Konva.Rect({ width: size, height: size, fill: 'rgba(37, 99, 235, 0.25)', stroke: '#2563eb', strokeWidth: 2, name: 'rect' });
  const text = new Konva.Text({ text: index.toString(), fontSize: Math.max(12, size * 0.25), fontStyle: 'bold', fill: '#ffffff', align: 'center', verticalAlign: 'middle', width: size, height: size, name: 'text' });
  group.add(rect); group.add(text); group.on('dragmove', () => constrainBounds(group)); boxLayer.add(group);
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
  if (boxes.length !== 32) { alert("Error: Click 'Auto Arrange Grid' first."); return; }
  const boxesPayload = boxes.map(g => {
    const rect = g.findOne('.rect');
    return { index: g.getAttr('boxIndex'), left: g.x(), top: g.y(), width: rect.width(), height: rect.height() };
  });
  boxesPayload.sort((a, b) => a.index - b.index);
  lastProcessedPayload = { imageUrl: currentImageData.imageUrl, rotation: rotationAngle, boxes: boxesPayload, previewOnly: true };
  try {
    const res = await fetch(window.location.origin + '/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lastProcessedPayload) });
    const data = await res.json(); if (data.success) displayResults(data); else alert(data.message);
  } catch (err) { alert("Processing error."); }
});

function displayResults(data) {
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
  if (!lastProcessedPayload) return;
  
  // previewOnly = false করার মানে হলো এবার ইমেজগুলো সাব-ফোল্ডারে রাইট হবে
  lastProcessedPayload.previewOnly = false;

  try {
    const res = await fetch(window.location.origin + '/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lastProcessedPayload)
    });
    
    const data = await res.json();
    
    if (data.success) {
      alert(`Successfully saved 32 images into: ${data.savedTo}`);
      
      window.location.reload(true); 
      
    } else {
      alert("Save failed: " + data.message);
    }
  } catch (err) {
    alert("Save error occurred.");
  }
});

function resetAppToInitialState() {
  currentImageObj = null; currentImageData = null; rotationAngle = 0; lastProcessedPayload = null; isCropMode = false;
  if (cropRect) { cropRect.destroy(); cropRect = null; }
  cropTransformer.nodes([]); boxLayer.destroyChildren(); imageLayer.destroyChildren();
  document.getElementById('upload-area').classList.remove('hidden'); document.getElementById('workspace-area').classList.add('hidden'); document.getElementById('results-area').classList.add('hidden');
  document.getElementById('file-input').value = ""; 
}

window.addEventListener('resize', () => { stage.width(container.offsetWidth || 1000); if (currentImageData) fitToScreen(); });