import { ObjectId } from 'mongodb';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import mime from 'mime-types';
import Bull from 'bull';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

// Create a Bull queue for file processing
const fileQueue = new Bull('fileQueue');

class FilesController {
  static async postUpload(req, res) {
    const token = req.headers['x-token'];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      name,
      type,
      parentId = 0,
      isPublic = false,
      data,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }

    const acceptedTypes = ['folder', 'file', 'image'];
    if (!type || !acceptedTypes.includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }

    if (type !== 'folder' && !data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    if (parentId !== 0) {
      const parentFile = await dbClient.db.collection('files').findOne({ _id: ObjectId(parentId) });
      if (!parentFile) {
        return res.status(400).json({ error: 'Parent not found' });
      }
      if (parentFile.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    const userObjectId = ObjectId(userId);

    if (type === 'folder') {
      const newFolder = {
        userId: userObjectId,
        name,
        type,
        parentId,
        isPublic,
      };

      try {
        const result = await dbClient.db.collection('files').insertOne(newFolder);
        return res.status(201).json({
          id: result.insertedId,
          userId,
          name,
          type,
          isPublic,
          parentId,
        });
      } catch (error) {
        console.error('Error creating folder:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
      }
    }

    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    const fileUUID = uuidv4();
    const filePath = `${folderPath}/${fileUUID}`;
    const fileData = Buffer.from(data, 'base64');

    try {
      fs.writeFileSync(filePath, fileData);

      const newFile = {
        userId: userObjectId,
        name,
        type,
        isPublic,
        parentId,
        localPath: filePath,
      };

      const result = await dbClient.db.collection('files').insertOne(newFile);

      // Add a job to the Bull queue for generating thumbnails
      if (type === 'image') {
        await fileQueue.add({
          userId,
          fileId: result.insertedId.toString(),
        });
      }

      return res.status(201).json({
        id: result.insertedId,
        userId,
        name,
        type,
        isPublic,
        parentId,
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async getShow(req, res) {
    const token = req.header('X-Token') || null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const redisToken = await redisClient.get(`auth_${token}`);
    if (!redisToken) return res.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(redisToken) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const idFile = req.params.id || '';
    if (!idFile) return res.status(404).json({ error: 'Not found' });

    try {
      const fileDocument = await dbClient.db.collection('files').findOne({ _id: ObjectId(idFile), userId: user._id });
      if (!fileDocument) return res.status(404).json({ error: 'File not found' });

      return res.json({
        id: fileDocument._id,
        userId: fileDocument.userId,
        name: fileDocument.name,
        type: fileDocument.type,
        isPublic: fileDocument.isPublic,
        parentId: fileDocument.parentId,
      });
    } catch (error) {
      console.error('Error fetching file:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async getIndex(req, res) {
    const token = req.header('X-Token') || null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const redisToken = await redisClient.get(`auth_${token}`);
    if (!redisToken) return res.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(redisToken) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    let parentId = req.query.parentId || '0';
    console.log(`Received parentId: ${parentId}`); // Log the received parentId

    if (parentId !== '0') {
      try {
        parentId = ObjectId(parentId);
      } catch (error) {
        console.error(`Invalid parentId: ${parentId}`); // Log invalid parentId conversion
        return res.status(400).json({ error: 'Invalid parentId' });
      }
    } else {
      parentId = 0;
    }

    console.log(`Processed parentId: ${parentId}`); // Log the processed parentId

    let page = parseInt(req.query.page, 10) || 0;
    page = page < 0 ? 0 : page;

    const aggregationMatch = { userId: user._id };
    if (parentId !== 0) aggregationMatch.$or = [{ parentId }, { parentId: parentId.toString() }];

    console.log(`Aggregation match: ${JSON.stringify(aggregationMatch)}`); // Log the aggregation match object

    try {
      const allFilesWithParentId = await dbClient.db.collection('files').find({
        $or: [
          { parentId },
          { parentId: parentId.toString() },
        ],
      }).toArray();
      console.log(`All files with parentId: ${JSON.stringify(allFilesWithParentId)}`); // Log all files with the specific parentId

      const filesCursor = await dbClient.db.collection('files').aggregate([
        { $match: aggregationMatch },
        { $skip: page * 20 },
        { $limit: 20 },
      ]);
      const filesArray = await filesCursor.toArray();

      console.log(`Fetched files: ${JSON.stringify(filesArray)}`); // Log fetched files

      const formattedFiles = filesArray.map((file) => ({
        id: file._id,
        userId: file.userId,
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId,
      }));

      return res.json(formattedFiles);
    } catch (error) {
      console.error('Error fetching files:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async putPublish(req, res) {
    const token = req.headers['x-token'];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    if (!fileId) {
      return res.status(404).json({ error: 'Not found' });
    }

    const userObjectId = ObjectId(userId);

    try {
      const fileDocument = await dbClient.db.collection('files').findOneAndUpdate(
        { _id: ObjectId(fileId), userId: userObjectId },
        { $set: { isPublic: true } },
        { returnOriginal: false },
      );

      if (!fileDocument.value) {
        return res.status(404).json({ error: 'Not found' });
      }

      return res.json({
        id: fileDocument.value._id,
        userId: fileDocument.value.userId,
        name: fileDocument.value.name,
        type: fileDocument.value.type,
        isPublic: fileDocument.value.isPublic,
        parentId: fileDocument.value.parentId,
      });
    } catch (error) {
      console.error('Error publishing file:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async putUnpublish(req, res) {
    const token = req.headers['x-token'];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    if (!fileId) {
      return res.status(404).json({ error: 'Not found' });
    }

    const userObjectId = ObjectId(userId);

    try {
      const fileDocument = await dbClient.db.collection('files').findOneAndUpdate(
        { _id: ObjectId(fileId), userId: userObjectId },
        { $set: { isPublic: false } },
        { returnOriginal: false },
      );

      if (!fileDocument.value) {
        return res.status(404).json({ error: 'Not found' });
      }

      return res.json({
        id: fileDocument.value._id,
        userId: fileDocument.value.userId,
        name: fileDocument.value.name,
        type: fileDocument.value.type,
        isPublic: fileDocument.value.isPublic,
        parentId: fileDocument.value.parentId,
      });
    } catch (error) {
      console.error('Error unpublishing file:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async getFile(req, res) {
    const fileId = req.params.id || '';
    const size = req.query.size || 0;

    let fileDocument;
    try {
      fileDocument = await dbClient.db.collection('files').findOne({ _id: ObjectId(fileId) });
    } catch (error) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (!fileDocument) {
      return res.status(404).json({ error: 'Not found' });
    }

    const {
      isPublic,
      userId,
      type,
      localPath,
      name,
    } = fileDocument;

    const token = req.header('X-Token') || null;
    let owner = false;

    if (token) {
      const redisToken = await redisClient.get(`auth_${token}`);
      if (redisToken) {
        const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(redisToken) });
        if (user) {
          owner = user._id.toString() === userId.toString();
        }
      }
    }

    if (!isPublic && !owner) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (type === 'folder') {
      return res.status(400).json({ error: "A folder doesn't have content" });
    }

    // const realPath = size === 0 ? localPath : `${localPath}_${size}`;

    try {
      let realPath;
      if (size === 0) {
        realPath = localPath;
      } else {
        realPath = `${localPath}_${size}`;
        // Check if file exists before attempting to read it
        if (!fs.existsSync(realPath)) {
          return res.status(404).json({ error: 'File not found' });
        }
      }

      const dataFile = fs.readFileSync(realPath);
      const mimeType = mime.contentType(name) || 'application/octet-stream';
      res.setHeader('Content-Type', mimeType);
      return res.send(dataFile);
    } catch (error) {
      console.error('Error retrieving file:', error);
      return res.status(404).json({ error: 'Not found' });
    }
  }
}

export default FilesController;
