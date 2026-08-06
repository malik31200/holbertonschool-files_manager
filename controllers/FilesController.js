import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';
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
    console.log('=== GET INDEX START ===');
    const token = req.headers['x-token'];
    console.log('TOKEN:', token);


    const userId = await redisClient.get(`auth_${token}`);
    console.log('USER ID:', userId);

    if (!userId) {
      console.log('NO USER');
      return res.status(401).json({
        error: 'Unauthorized',
      });
    }
    console.log('QUERY:', req.query);

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
      parentId: file.parentId === '0' ? 0 : file.parentId.toString(),
    }));

    return res.status(200).json(result);
  }
}

export default FilesController;
