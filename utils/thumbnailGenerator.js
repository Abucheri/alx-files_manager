import thumbnail from 'image-thumbnail';
import fs from 'fs';

/**
 * Function to generate thumbnails for an image file.
 * @param {string} filePath - Path to the original image file.
 */
async function generateImageThumbnails(filePath) {
  const thumbnailSizes = [500, 250, 100];
  const promises = [];

  for (const size of thumbnailSizes) {
    const thumbnailPath = `${filePath}_${size}`;
    promises.push(
      thumbnail({
        path: filePath,
        width: size,
      }).then((thumbnailBuffer) => {
        fs.writeFileSync(thumbnailPath, thumbnailBuffer);
      }),
    );
  }

  await Promise.all(promises);
}

export default generateImageThumbnails;
