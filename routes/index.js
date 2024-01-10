var express = require('express');
var router = express.Router();
var mysql = require('mysql2');

require('dotenv').config();

var con = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectTimeout: process.env.DB_TIMEOUT,
  authPlugin: process.env.DB_AUTH_PLUGIN,
  database: process.env.DB_DATABASE
});


con.connect(function(err) {
  if (err) throw err;
  console.log("Connected!");
});


/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Baze podataka' });
});
//
router.get('/izvjestaj', function(req, res, next) {
  res.render('formaIzvjestaja', { title: 'Izvještaj' });
});
router.post('/izvjestaj', function(req, res, next) {
  var izvjestaj = {
    pocetni: req.body.pocetni,
    zavrsni:req.body.zavrsni
  };
  var sql = `call IzvjestajNarudzbePoKlijentima('${izvjestaj.pocetni}', '${izvjestaj.zavrsni}')`;
  con.connect(function(err) {
    if (err) throw err;
    con.query(sql, function (err, result, fields) {
      if (err) throw err;
      console.log(result);
      res.render('rezultatIzvjestaja', { title: 'Izvještaj', izvjestaj: result[0] });
    });
  });
});

router.get('/proizvodi', (req, res) => {
  const query = `select k.kategorija, p.naziv, p.opis, p.cijena, p.slika from kategorija_proizvoda k
                 join proizvodi p on k.id = p.fk_kategorija_proizvoda_id
                 order by k.kategorija, p.naziv`;
  con.connect(function(err) {
    if (err) throw err;
    con.query(query, (err, results) => {
      if (err) {
        console.error( err);
        res.status(500).json({ error: 'Internal server error' });
        return;
      }

      const kategorije = {};
      results.forEach((proizvod) => {
        if (!kategorije[proizvod.kategorija]) {
          kategorije[proizvod.kategorija] = [];
        }
        kategorije[proizvod.kategorija].push(proizvod);
      });

      res.render('proizvodi', {title: 'Proizvodi', kategorije});
    });
  })
});

router.get('/narudzbe', function(req, res, next) {
  res.render('narudzba', { title: 'Narudzba' });
});


router.post('/narudzbe', (req, res) => {
  const narudzba = {
    datum: req.body.datum,
    vrijeme: req.body.vrijeme,
    klijentIme: req.body.klijentIme,
    klijentPrezime: req.body.klijentPrezime,
    proizvod: req.body.proizvod,
    kolicina: req.body.kolicina
  };
  let cijena;
  let klijentID;

  const sql1 = 'select k.id from klijent k where k.ime = ? and k.prezime = ?';
  const values1 = [narudzba.klijentIme, narudzba.klijentPrezime];

  con.query(sql1, values1, function (err, result1) {
    if (err) {
      console.error('Error selecting klijent:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }

    if (result1.length > 0) {
      klijentID = result1[0].id;

      const query = 'insert into narudzbe (datum, vrijeme, klijent) values (?, ?, ?)';
      const values2 = [narudzba.datum, narudzba.vrijeme, klijentID];

      con.query(query, values2, function (err, result2) {
        if (err) {
          console.error('Error inserting narudzba:', err);
          res.status(500).json({ error: 'Internal server error' });
          return;
        }

        const narudzbaId = result2.insertId;

        const sql2 = 'select p.id from proizvodi p where p.naziv = ?';
        const values3 = [narudzba.proizvod];

        con.query(sql2, values3, function (err, result3) {
          if (err) {
            console.error('Error selecting proizvod:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
          }

          if (result3.length > 0) {
            const proizvodID = result3[0].id;

            const sql3 = 'select cijena from stavke_cjenovnika where sifra_proizvoda = ?';
            con.query(sql3, [proizvodID], function (err, result4) {
              if (err) {
                console.error('Error selecting cijena:', err);
                res.status(500).json({ error: 'Internal server error' });
                return;
              }

              if (result4.length > 0) {
                cijena = result4[0].cijena;
                console.info(cijena);
                const queryStavke = 'insert into stavke (fk_narudzba_id, fk_proizvod_id, kolicina, cijena) values (?, ?, ?, ?)';
                const values4 = [narudzbaId, proizvodID, narudzba.kolicina, cijena];

                con.query(queryStavke, values4, function (err, result5) {
                  if (err) {
                    console.error('Error inserting stavke:', err);
                    res.status(500).json({ error: 'Internal server error' });
                    return;
                  }

                  res.status(201).json({ message: 'Narudžba uspješno kreirana', narudzbaId });
                });
              } else {
                res.status(404).json({ error: 'Cijena not found for proizvod' });
              }
            });
          } else {
            res.status(404).json({ error: 'Proizvod not found' });
          }
        });
      });
    } else {
      res.status(404).json({ error: 'Klijent not found' });
    }
  });
});


router.get('/cjenovnik', (req, res) => {
  const query = `select c.id, c.datum_vazenja, c.naziv, c.napomena, s.redni_broj, s.sifra_proizvoda, p.naziv as proizvod_naziv, s.cijena
                 from cjenovnik c left join stavke_cjenovnika s on c.id = s.fk_cjenovnik_id
                 left join proizvodi p on s.sifra_proizvoda = p.id 
                 order by c.id, s.redni_broj`;

  con.query(query, (err, results) => {
    if (err) {
      console.error('Error selecting cjenovnik:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }

    const cjenovnikData = [];
    let trenutniCjenovnik;

    results.forEach(row => {
      if (!trenutniCjenovnik || trenutniCjenovnik.id !== row.id) {
        if (trenutniCjenovnik) {
          cjenovnikData.push(trenutniCjenovnik);
        }
        trenutniCjenovnik = {
          id: row.id,
          datum_vazenja: row.datum_vazenja,
          naziv: row.naziv,
          napomena: row.napomena,
          stavke: [],
        };
      }

      if (row.redni_broj) {
        trenutniCjenovnik.stavke.push({
          redni_broj: row.redni_broj,
          sifra_proizvoda: row.sifra_proizvoda,
          proizvod_naziv: row.proizvod_naziv,
          cijena: row.cijena,
        });
      }
    });

    if (trenutniCjenovnik) {
      cjenovnikData.push(trenutniCjenovnik);
    }

    res.render('cjenovnik', { title: 'Cjenovnik', cjenovnikData });
  });
});

process.on('exit', () => {
  con.end();
  console.log('MySQL connection closed');
});

module.exports = router;
