import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class FilesController {
  static async postUpload(req, res) {
    const token = req.headers['x-token'];

    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
      });
    }

    const {
      name,
      type,
      parentId = '0',
      isPublic = false,
      data,
    } = req.body || {};

    if (!name) {
      return res.status(400).json({
        error: 'Missing name',
      });
    }

    if (!type || !['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({
        error: 'Missing type',
      });
    }

    if (type !== 'folder' && !data) {
      return res.status(400).json({
        error: 'Missing data',
      });
    }

    if (parentId !== '0') {
      if (!ObjectId.isValid(parentId)) {
        return res.status(400).json({
          error: 'Parent not found',
        });
      }

      const parent = await dbClient.db
        .collection('files')
        .findOne({
          _id: new ObjectId(parentId),
        });

      if (!parent) {
        return res.status(400).json({
          error: 'Parent not found',
        });
      }

      if (parent.type !== 'folder') {
        return res.status(400).json({
          error: 'Parent is not a folder',
        });
      }
    }

    if (type === 'folder') {
      const result = await dbClient.db
        .collection('files')
        .insertOne({
          userId: new ObjectId(userId),
          name,
          type,
          isPublic,
          parentId,
        });

      return res.status(201).json({
        id: result.insertedId.toString(),
        userId,
        name,
        type,
        isPublic,
        parentId: parentId === '0' ? 0 : parentId,
      });
    }

    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    const filename = uuidv4();
    const localPath = path.join(folderPath, filename);

    const buffer = Buffer.from(data, 'base64');

    await fs.promises.writeFile(localPath, buffer);

    const result = await dbClient.db
      .collection('files')
      .insertOne({
        userId: new ObjectId(userId),
        name,
        type,
        isPublic,
        parentId,
        localPath,
      });

    return res.status(201).json({
      id: result.insertedId.toString(),
      userId,
      name,
      type,
      isPublic,
      parentId: parentId === '0' ? 0 : parentId,
      localPath,
    });
  }

  static async getShow(req, res) {
    const token = req.headers['x-token'];

    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
      });
    }

    let file;

    try {
      file = await dbClient.db
        .collection('files')
        .findOne({
          _id: new ObjectId(req.params.id),
          userId: new ObjectId(userId),
        });
    } catch (err) {
      return res.status(404).json({
        error: 'Not Found',
      });
    }

    if (!file) {
      return res.status(404).json({
        error: 'Not found',
      });
    }

    return res.status(200).json({
      id: file._id.toString(),
      userId: file.userId.toString(),
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId === '0' ? 0 : file.parentId.toString(),
    });
  }

  static async getIndex(req, res) {
    const token = req.headers['x-token'];

    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
      });
    }
    const {
      parentId = '0',
      page = 0,
    } = req.query;

    let parentQuery = '0';

    if (parentId !== '0') {
      parentQuery = new ObjectId(parentId);
    }

    const pageNumber = parseInt(page, 10) || 0;

    const files = await dbClient.db
      .collection('files')
      .find({
        userId: new ObjectId(userId),
        parentId: parentQuery,
      })
      .skip(pageNumber * 20)
      .limit(20)
      .toArray();

    const result = files.map((file) => ({
      id: file._id.toString(),
      userId: file.userId.toString(),
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId === '0' ? '0' : file.parentId.toString(),
    }));

    return res.status(200).json(result);
  }

  static async putPublish(req, res) {
    const token = req.headers['x-token'];

    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
      });
    }

    let file;

    try {
      file = await dbClient.db
        .collection('files')
        .findOne({
          userId: new ObjectId(userId),
          _id: new ObjectId(req.params.id),
        });
    } catch (err) {
      return res.status(404).json({
        error: 'Not found',
      });
    }

    if (!file) {
      return res.status(404).json({
        error: 'Not found',
      });
    }

    try {
      await dbClient.db
        .collection('files')
        .updateOne(
          {
            _id: new ObjectId(req.params.id),
            userId: new ObjectId(userId),
          },
          {
            $set: {
              isPublic: true,
            },
          },
        );
    } catch (err) {
      return res.status(404).json({
        error: 'Not found',
      });
    }

    return res.status(200).json({
      id: file._id.toString(),
      userId: file.userId.toString(),
      name: file.name,
      type: file.type,
      isPublic: true,
      parentId: file.parentId === '0' ? 0 : file.parentId.toString(),
    });
  }

  static async putUnpublish(req, res) {
    const token = req.headers['x-token'];

    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
      });
    }

    let file;

    try {
      file = await dbClient.db
        .collection('files')
        .findOne({
          userId: new ObjectId(userId),
          _id: new ObjectId(req.params.id),
        });
    } catch (err) {
      return res.status(404).json({
        error: 'Not found',
      });
    }

    if (!file) {
      return res.status(404).json({
        error: 'Not found',
      });
    }

    await dbClient.db
      .collection('files')
      .updateOne(
        {
          userId: new ObjectId(userId),
          _id: new ObjectId(req.params.id),
        },
        {
          $set: {
            isPublic: false,
          },
        },
      );

    return res.status(200).json({
      id: file._id.toString(),
      userId: file.userId.toString(),
      name: file.name,
      type: file.type,
      isPublic: false,
      parentId: file.parentId === '0' ? 0 : file.parentId.toString(),
    });
  }

  static async getFile(req, res) {
    let file;

    try {
      file = await dbClient.db
        .collection('files')
        .findOne({
          _id: new ObjectId(req.params.id),
        });
    } catch (err) {
      return res.status(404).json({
        error: 'Not found',
      });
    }

    if (!file) {
      return res.status(404).json({
        error: 'Not found',
      });
    }

    if (!file.isPublic) {
      const token = req.headers['x-token'];

      const userId = await redisClient.get(`auth_${token}`);

      if (!userId || userId !== file.userId.toString()) {
        return res.status(404).json({
          error: 'Not found',
        });
      }
    }

    if (file.type === 'folder') {
      return res.status(400).json({
        error: "A folder doesn't have content",
      });
    }

    if (!fs.existsSync(file.localPath)) {
      return res.status(404).json({
        error: 'Not found',
      });
    }

    let data;

    try {
      data = await fs.promises.readFile(file.localPath);
    } catch (err) {
      return res.status(404).json({
        error: 'Not Found',
      });
    }

    let mimeType = mime.lookup(file.name);

    if (!mimeType) {
      mimeType = 'application/octet-stream';
    }

    res.setHeader('Content-Type', mimeType);

    return res.status(200).send(data);
  }
}

export default FilesController;
