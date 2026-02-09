import { Router } from 'express';
import { reportController } from '../controllers/report.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validation.middleware';
import { createReportSchema } from '../schemas/report.schema';
import { asyncHandler } from '../utils';

const router = Router();

// All report routes require authentication
router.use(authenticateToken);

// Create a new report (bug, complaint, etc.)
router.post('/', validateRequest(createReportSchema), asyncHandler(reportController.createReport));

// Get all reports submitted by the current user
router.get('/my-reports', asyncHandler(reportController.getMyReports));

export default router;
