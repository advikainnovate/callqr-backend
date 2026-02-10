import { Router } from 'express';
import { reportController } from '../controllers/report.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';
import {
  createBugReportSchema,
  getBugReportSchema,
  updateBugReportStatusSchema,
  updateBugReportSeveritySchema,
  getBugReportsBySeveritySchema,
  getBugReportsByStatusSchema,
} from '../schemas/report.schema';

const router = Router();

// Create bug report (can be anonymous)
router.post('/', validate(createBugReportSchema), reportController.createBugReport);

// Get bug report by ID
router.get('/:reportId', authenticateToken, validate(getBugReportSchema), reportController.getBugReport);

// Get my bug reports
router.get('/my/all', authenticateToken, reportController.getMyBugReports);

// Get all bug reports (admin only - you may want to add admin middleware)
router.get('/admin/all', authenticateToken, reportController.getAllBugReports);

// Update bug report status (admin only)
router.patch('/:reportId/status', authenticateToken, validate(updateBugReportStatusSchema), reportController.updateBugReportStatus);

// Update bug report severity (admin only)
router.patch('/:reportId/severity', authenticateToken, validate(updateBugReportSeveritySchema), reportController.updateBugReportSeverity);

// Get bug reports by severity (admin only)
router.get('/severity/:severity', authenticateToken, validate(getBugReportsBySeveritySchema), reportController.getBugReportsBySeverity);

// Get bug reports by status (admin only)
router.get('/status/:status', authenticateToken, validate(getBugReportsByStatusSchema), reportController.getBugReportsByStatus);

export default router;
