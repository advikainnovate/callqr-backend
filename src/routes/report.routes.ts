import { Router } from 'express';
import { reportController } from '../controllers/report.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

// All report routes require authentication
router.use(authenticateToken);

// Create a new report (bug, complaint, etc.)
router.post('/', reportController.createReport);

// Get all reports submitted by the current user
router.get('/my-reports', reportController.getMyReports);

export default router;
