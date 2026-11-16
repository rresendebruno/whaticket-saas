import { Router } from "express";

import isAuth from "../middleware/isAuth";
import * as UserController from "../controllers/UserController";
import * as ProfileController from "../controllers/ProfileController";

const userRoutes = Router();

// Own profile (name/password) — available to every logged-in user
userRoutes.put("/profile", isAuth, ProfileController.update);

userRoutes.get("/users", isAuth, UserController.index);

userRoutes.post("/users", isAuth, UserController.store);

userRoutes.put("/users/:userId", isAuth, UserController.update);

userRoutes.get("/users/:userId", isAuth, UserController.show);

userRoutes.delete("/users/:userId", isAuth, UserController.remove);

export default userRoutes;
