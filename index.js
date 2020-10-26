var proxy = require("express-http-proxy");
const express = require("express");
const cors = require("cors");
const mysql = require("mysql");
var jwt = require("jsonwebtoken");
const fs = require("fs");
const app = express();
const { exec } = require("child_process");
const { TIMEOUT } = require("dns");

const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "TCC",
});

connection.connect((err) => {
  if (err) {
    return err;
  }
});

app.use(cors());

app.use(
  "/*",
  proxy(`localhost:3000`, {
    filter: (req) => !req.baseUrl.startsWith("/api"),
    proxyReqPathResolver: (req) => req.baseUrl,
  })
);

app.use(express.json());

app.post("/api/login", (req, res) => {
  connection.query(
    `SELECT nome,cargo FROM user WHERE username = "${req.body.loginName}" AND password = "${req.body.password}"`,
    (err, rows) => {
      if (err) {
        res.status(500).send();
      }
      if (rows[0] === undefined) {
        res.status(401).send();
      }
      const token = jwt.sign({ expirationDate: Date.now() + 1000000 }, "a");
      res.cookie("authCookie", token, {
        path: "/",
        expires: new Date(Date.now() + 9000000),
        httpOnly: true,
      });
      if (rows[0].cargo === 0) {
        res.send({ url: "/aluno" });
        return;
      } else if (rows[0].cargo === 1) {
        res.send({ url: "/professor/perfil" });
        return;
      }
    }
  );
});

app.get("/api/subjects", (req, res) => {
  connection.query(`SELECT id, materia FROM materia`, (err, rows) => {
    if (err) {
      res.status(500).send();
    } else {
      res.json(rows);
    }
  });
});

app.get("/api/subject/:id/topics", (req, res) => {
  connection.query(
    `SELECT id, assunto FROM assunto WHERE materia = "${req.params.id}"`,
    (err, rows) => {
      if (err) {
        res.status(500).send();
      } else {
        res.json(rows);
      }
    }
  );
});

app.get("/api/topic/:id/questions", (req, res) => {
  connection.query(
    `SELECT id, titulo, enunciado, resposta FROM questions WHERE flag_assunto = "${req.params.id}"`,
    (err, rows) => {
      if (err) {
        res.status(500).send();
      } else {
        res.json(rows);
      }
    }
  );
});

app.get("/api/subject/:id/topic/:newTopic", (req, res) => {
  connection.query(
    `INSERT INTO  assunto VALUES (NULL, "${req.params.newTopic}", ${req.params.id})`,
    (err, rows) => {
      if (err) {
        res.status(500).send();
      } else {
        res.json(rows);
      }
    }
  );
});

app.post("/api/teste", (req, res) => {
  var cmd = "gcc question6.c -o question6 && question6.exe";
  fs.writeFileSync("question6.c", req.body.resp);
  if (req.body.input) {
    fs.writeFileSync("input.txt", req.body.input);
    cmd = "gcc question6.c -o question6 && question6.exe < input.txt";
  }
  exec(cmd, { timeout: 2000 }, (error, stdout, stderr) => {
    if (error) {
      console.log(`error: ${error.message}`);
      res.send({
        output:
          "O programa demorou mais de 2 segundos para responder e foi aniquilado.",
      });
      //res.status(500).send();
    } else if (stderr) {
      console.log(`stderr: ${stderr}`);
      res.send({ output: stderr });
      //res.status(500).send();
    } else {
      console.log(`stdout: ${stdout}`);
      res.send({ output: stdout });
    }
    //res.send({ output: stdout });
  });
});

app.listen(4000, () => {
  console.log(`Listening...`);
});
