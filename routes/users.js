var express = require('express');
var router = express.Router();

var mysql = require('mysql');


var con = mysql.createConnection({
  host: "bazepodataka.ba",
  user: "student2363",
  password: "13412"
});



/* GET users listing. */
router.get('/', function(req, res, next) {
  res.send('respond with a resource');
});



module.exports = router;
