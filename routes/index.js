import express from 'express';
import AppController from '../controlllers/AppController';

const router = express.Router();

router.get('/status', AppController.getStatus);

router.get('/stats', AppController.getStats);

export default router;
