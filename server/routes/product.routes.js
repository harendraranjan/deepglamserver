const express = require("express");
const router = express.Router();
const productCtrl = require("../controllers/product.controller");

router.post("/", productCtrl.createProduct);
router.get('/disapproved', productCtrl.getDisapprovedProducts);
router.put("/:id", productCtrl.updateProduct);


router.get("/my/products", productCtrl.getMyProducts);
//router.delete("/:id", productCtrl.deleteProduct);
router.get("/", productCtrl.getAllProducts);
router.get("/:id", productCtrl.getProductById);

router.put("/approve/:id", productCtrl.approveProduct);
router.post("/clone/:id", productCtrl.cloneProduct);

module.exports = router;
