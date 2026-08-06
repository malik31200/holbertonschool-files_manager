static async postUpload(req, res) {
  console.log('=== POST /files START ===');

  const token = req.headers['x-token'];
  console.log('TOKEN:', token);

  const userId = await redisClient.get(`auth_${token}`);
  console.log('USER ID:', userId);

  if (!userId) {
    console.log('ERROR: Unauthorized');
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

  console.log('BODY:', {
    name,
    type,
    parentId,
    isPublic,
    hasData: !!data,
  });

  if (!name) {
    console.log('ERROR: Missing name');
    return res.status(400).json({
      error: 'Missing name',
    });
  }

  if (!type || !['folder', 'file', 'image'].includes(type)) {
    console.log('ERROR: Missing type');
    return res.status(400).json({
      error: 'Missing type',
    });
  }

  if (type !== 'folder' && !data) {
    console.log('ERROR: Missing data');
    return res.status(400).json({
      error: 'Missing data',
    });
  }

  if (parentId !== '0') {
    console.log('CHECKING PARENT');

    if (!ObjectId.isValid(parentId)) {
      console.log('ERROR: Invalid parentId');
      return res.status(400).json({
        error: 'Parent not found',
      });
    }

    const parent = await dbClient.db
      .collection('files')
      .findOne({
        _id: new ObjectId(parentId),
      });

    console.log('PARENT:', parent);

    if (!parent) {
      console.log('ERROR: Parent not found');
      return res.status(400).json({
        error: 'Parent not found',
      });
    }

    if (parent.type !== 'folder') {
      console.log('ERROR: Parent is not a folder');
      return res.status(400).json({
        error: 'Parent is not a folder',
      });
    }
  }

  if (type === 'folder') {
    console.log('CREATING FOLDER');

    const result = await dbClient.db
      .collection('files')
      .insertOne({
        userId: new ObjectId(userId),
        name,
        type,
        isPublic,
        parentId,
      });

    console.log('FOLDER CREATED:', result.insertedId.toString());

    return res.status(201).json({
      id: result.insertedId.toString(),
      userId,
      name,
      type,
      isPublic,
      parentId,
    });
  }

  console.log('CREATING FILE');

  const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
  console.log('FOLDER PATH:', folderPath);

  if (!fs.existsSync(folderPath)) {
    console.log('CREATING DIRECTORY');
    fs.mkdirSync(folderPath, { recursive: true });
  }

  const filename = uuidv4();
  const localPath = path.join(folderPath, filename);

  console.log('LOCAL PATH:', localPath);

  const buffer = Buffer.from(data, 'base64');

  console.log('WRITING FILE');
  await fs.promises.writeFile(localPath, buffer);
  console.log('FILE WRITTEN');

  console.log('INSERTING INTO MONGO');

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

  console.log('MONGO INSERT OK:', result.insertedId.toString());

  return res.status(201).json({
    id: result.insertedId.toString(),
    userId,
    name,
    type,
    isPublic,
    parentId,
    localPath,
  });
}