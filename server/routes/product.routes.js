const express = require("express");
const router = express.Router();
const productCtrl = require("../controllers/product.controller");
//routes/product.routes.js
//const { imageUpload } = require("../config/cloudinary");
const upload = require('../middlewares/multer.middleware');
router.post("/",productCtrl.createProduct);

router.get('/disapproved', productCtrl.getDisapprovedProducts);
//router.post("/", productCtrl.createProduct);
router.put("/:id", productCtrl.updateProduct);
router.delete("/:id", productCtrl.deleteProduct);
router.get("/", productCtrl.getAllProducts);
router.get("/:id", productCtrl.getProductById);
router.put("/approve/:id", productCtrl.approveProduct);
router.post("/clone/:id", productCtrl.cloneProduct);


module.exports = router;
