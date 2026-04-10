import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./modules/auth";
import usersRouter from "./modules/users";
import foodRouter from "./modules/food";
import healthTrackingRouter from "./modules/health";
import medicineRouter from "./modules/medicine";
import bloodRouter from "./modules/blood";
import businessRouter from "./modules/business";
import adminRouter from "./modules/admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(foodRouter);
router.use(healthTrackingRouter);
router.use(medicineRouter);
router.use(bloodRouter);
router.use(businessRouter);
router.use(adminRouter);

export default router;
