const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const heicConvert = require('heic-convert');
const cors = require('cors');
const storageConfig = require('./storage.js');

const app = express();
const PORT = 3005;

app.use(cors());

// পেলোড লিমিট সর্বোচ্চ বাড়ানো হলো যেন মেমোরি বাফারে সমস্যা না হয়
app.use(express.json({ limit: '2000mb' }));
app.use(express.urlencoded({ limit: '2000mb', extended: true, parameterLimit: 1000000 }));

app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 } // ৫০০ মেগাবাইট পর্যন্ত ফাইল সাপোর্ট
});

app.get('/health', (req, res) => res.json({ success: true, status: 'UP' }));

app.post('/upload', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

  try {
    let imageBuffer = req.file.buffer;
    let ext = path.extname(req.file.originalname).toLowerCase();
    let mimeType = req.file.mimetype;
    
    if (ext === '.heic' || (mimeType && mimeType.includes('heic'))) {
      imageBuffer = await heicConvert({ buffer: imageBuffer, format: 'PNG', quality: 1 });
      mimeType = 'image/png';
    }

    const metadata = await sharp(imageBuffer).metadata();
    const base64Image = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

    res.json({ 
      success: true, 
      imageUrl: base64Image, 
      width: metadata.width, 
      height: metadata.height 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Image processing failed" });
  }
});

app.post('/crop', async (req, res) => {
  try {
    let { imageUrl, left, top, width, height } = req.body;
    if (!imageUrl) return res.status(400).json({ success: false, message: "Image missing" });

    const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
    const inputBuffer = Buffer.from(base64Data, 'base64');

    const metadata = await sharp(inputBuffer).metadata();
    const origW = metadata.width;
    const origH = metadata.height;

    left = Math.max(0, Math.floor(Number(left)));
    top = Math.max(0, Math.floor(Number(top)));
    width = Math.floor(Number(width));
    height = Math.floor(Number(height));

    if (left + width > origW) width = origW - left;
    if (top + height > origH) height = origH - top;

    if (width <= 0 || height <= 0) return res.status(400).json({ success: false, message: "Invalid crop bounds" });

    const croppedBuffer = await sharp(inputBuffer)
      .extract({ left: left, top: top, width: width, height: height })
      .png()
      .toBuffer();

    res.json({
      success: true,
      imageUrl: `data:image/png;base64,${croppedBuffer.toString('base64')}`,
      width: width,
      height: height
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Cropping failed" });
  }
});

app.post('/process', async (req, res) => {
  try {
    const { imageUrl, rotation, boxes, previewOnly } = req.body;
    if (!imageUrl || !boxes || boxes.length !== 32) {
      return res.status(400).json({ success: false, message: "Invalid payload" });
    }

    const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
    const inputBuffer = Buffer.from(base64Data, 'base64');

    let targetDir = storageConfig.outputDirectory || path.join(__dirname, 'output');
    if (!previewOnly && !fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const now = new Date();
    const timestamp = now.getFullYear().toString() + (now.getMonth() + 1).toString().padStart(2, '0') + now.getDate().toString().padStart(2, '0') + '_' + now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0') + now.getSeconds().toString().padStart(2, '0');

    let pipeline = sharp(inputBuffer);
    const metadata = await pipeline.metadata();
    const origW = metadata.width; const origH = metadata.height;

    const normalizedRotation = ((rotation % 360) + 360) % 360;
    if (normalizedRotation !== 0) pipeline = pipeline.rotate(normalizedRotation);

    const rotatedImageBuffer = await pipeline.toBuffer();
    const filesResponse = [];

    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      let { left, top, width, height } = box;
      let mappedLeft, mappedTop, mappedWidth, mappedHeight;

      if (normalizedRotation === 0) { mappedLeft = left; mappedTop = top; mappedWidth = width; mappedHeight = height; } 
      else if (normalizedRotation === 90) { mappedLeft = top; mappedTop = origW - (left + width); mappedWidth = height; mappedHeight = width; } 
      else if (normalizedRotation === 180) { mappedLeft = origW - (left + width); mappedTop = origH - (top + height); mappedWidth = width; mappedHeight = height; } 
      else if (normalizedRotation === 270) { mappedLeft = origH - (top + height); mappedTop = left; mappedWidth = height; mappedHeight = width; }

      mappedLeft = Math.max(0, Math.round(mappedLeft)); mappedTop = Math.max(0, Math.round(mappedTop));
      mappedWidth = Math.max(25, Math.round(mappedWidth)); mappedHeight = Math.max(25, Math.round(mappedHeight));

      const cropBuffer = await sharp(rotatedImageBuffer)
        .extract({ left: mappedLeft, top: mappedTop, width: mappedWidth, height: mappedHeight })
        .resize(100, 100)
        .png()
        .toBuffer();

      if (!previewOnly) {
        const subDirectoryPath = path.join(targetDir, box.index.toString());
        if (!fs.existsSync(subDirectoryPath)) fs.mkdirSync(subDirectoryPath, { recursive: true });
        const filename = `${box.index}_${timestamp}.png`;
        fs.writeFileSync(path.join(subDirectoryPath, filename), cropBuffer);
      }

      filesResponse.push({
        index: box.index,
        filename: `${box.index}_${timestamp}.png`,
        preview: `data:image/png;base64,${cropBuffer.toString('base64')}`
      });
    }

    res.json({ success: true, generated: 32, savedTo: targetDir, files: filesResponse });
  } catch (error) {
    res.status(500).json({ success: false, message: "Processing failed" });
  }
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));