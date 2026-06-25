import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as ReportController from "../controllers/ReportController";

const reportRoutes = Router();

reportRoutes.get("/reports/overview", isAuth, ReportController.overview);
reportRoutes.get("/reports/supervisor", isAuth, ReportController.supervisor);

export default reportRoutes;
