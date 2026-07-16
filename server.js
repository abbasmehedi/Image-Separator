const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const heicConvert = require('heic-convert');
const cors = require('cors');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors());

app.use(express.json({ limit: '2000mb' }));
app.use(express.urlencoded({ limit: '2000mb', extended: true, parameterLimit: 1000000 }));

app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 }
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

// Shared logic: Cut out the 32 boxes directly without rotation
async function generateCrops(imageUrl, boxes) {
  const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
  const inputBuffer = Buffer.from(base64Data, 'base64');

  const now = new Date();
  const timestamp = now.getFullYear().toString() + (now.getMonth() + 1).toString().padStart(2, '0') + now.getDate().toString().padStart(2, '0') + '_' + now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0') + now.getSeconds().toString().padStart(2, '0');

  const crops = [];

  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    let { left, top, width, height } = box;

    let mappedLeft = Math.max(0, Math.round(left)); 
    let mappedTop = Math.max(0, Math.round(top));
    let mappedWidth = Math.max(25, Math.round(width)); 
    let mappedHeight = Math.max(25, Math.round(height));

    const cropBuffer = await sharp(inputBuffer)
      .extract({ left: mappedLeft, top: mappedTop, width: mappedWidth, height: mappedHeight })
      .resize(100, 100)
      .png()
      .toBuffer();

    crops.push({ index: box.index, filename: `${box.index}_${timestamp}.png`, buffer: cropBuffer });
  }

  return crops;
}

app.post('/process', async (req, res) => {
  try {
    const { imageUrl, boxes } = req.body;
    if (!imageUrl || !boxes || boxes.length !== 32) {
      return res.status(400).json({ success: false, message: "Invalid payload" });
    }

    const crops = await generateCrops(imageUrl, boxes);
    const filesResponse = crops.map(c => ({
      index: c.index,
      filename: c.filename,
      preview: `data:image/png;base64,${c.buffer.toString('base64')}`
    }));

    res.json({ success: true, generated: filesResponse.length, files: filesResponse });
  } catch (error) {
    res.status(500).json({ success: false, message: "Processing failed" });
  }
});

app.post('/download', async (req, res) => {
  try {
    const { imageUrl, boxes } = req.body;
    if (!imageUrl || !boxes || boxes.length !== 32) {
      return res.status(400).json({ success: false, message: "Invalid payload" });
    }

    const crops = await generateCrops(imageUrl, boxes);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="image_separator_output.zip"');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => { res.status(500).end(); });
    archive.pipe(res);

    for (const crop of crops) {
      archive.append(crop.buffer, { name: `${crop.index}/${crop.filename}` });
    }

    await archive.finalize();
  } catch (error) {
    res.status(500).json({ success: false, message: "Download failed" });
  }
});

app.listen(PORT, () => console.log(`Server running on: http://localhost:${PORT}`));