var proxy = require("express-http-proxy");
const express = require("express");
const cors = require("cors");
const mysql = require("mysql");
var jwt = require("jsonwebtoken");
const fs = require("fs");
const app = express();
const { exec } = require("child_process");

//config database
var db_config = {
  host: "localhost",
  user: "root",
  password: "",
  database: "tcc-database",
  multipleStatements: true,
};

//database connection
var connection;

function handleDisconnect() {
  connection = mysql.createConnection(db_config); // Recreate the connection, since
  // the old one cannot be reused.

  connection.connect(function (err) {
    // The server is either down
    if (err) {
      // or restarting (takes a while sometimes).
      console.log("error when connecting to db:", err);
      setTimeout(handleDisconnect, 2000); // We introduce a delay before attempting to reconnect,
    } // to avoid a hot loop, and to allow our node script to
  }); // process asynchronous requests in the meantime.
  // If you're also serving http, display a 503 error.
  connection.on("error", function (err) {
    console.log("db error", err);
    if (err.code === "PROTOCOL_CONNECTION_LOST") {
      // Connection to the MySQL server is usually
      handleDisconnect(); // lost due to either server restart, or a
    } else {
      // connnection idle timeout (the wait_timeout
      throw err; // server variable configures this)
    }
  });
}

handleDisconnect();

//using cors
app.use(cors());

//setting up a proxy
app.use(
  "/*",
  proxy(`localhost:3000`, {
    filter: (req) => !req.baseUrl.startsWith("/api"),
    proxyReqPathResolver: (req) => req.baseUrl,
  })
);

//making json default format
app.use(express.json());

//validating user login
app.post("/api/login", (req, res) => {
  const sql = `SELECT nome,cargo FROM user WHERE username = "${req.body.loginName}" AND password = "${req.body.password}"`;
  connection.query(sql, (err, rows) => {
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
  });
});

//getting subjects
app.get("/api/subjects", (req, res) => {
  const sql = `SELECT subject_id, subject FROM subject`;
  connection.query(sql, (err, rows) => {
    if (err) {
      res.status(500).send();
    } else {
      res.json(rows);
    }
  });
});

//getting topic list based on a subject
app.get("/api/subject/:id/topics", (req, res) => {
  const sql = `SELECT topic_id, topic FROM topic WHERE subject_id = "${req.params.id}"`;
  connection.query(sql, (err, rows) => {
    if (err) {
      res.status(500).send();
    } else {
      res.json(rows);
    }
  });
});

//get question list based on a topic
app.get("/api/topic/:id/questions", (req, res) => {
  const sql = `SELECT question_id, title, type FROM question WHERE topic_id = "${req.params.id}"`;
  connection.query(sql, (err, rows) => {
    if (err) {
      res.status(500).send();
    } else {
      res.json(rows);
    }
  });
});

//get current question
app.get("/api/questions/:id", (req, res) => {
  connection.query(
    `SELECT title, description, type, difficulty FROM question WHERE question_id = "${req.params.id}"`,
    (err, rows) => {
      if (err) {
        res.status(500).send();
      } else {
        res.json(rows);
      }
    }
  );
});
//get current question answer
app.get("/api/questions/answer/:question/:type", (req, res) => {
  if (parseInt(req.params.type) === 1) {
    connection.query(
      `SELECT answer FROM discursive_question_template WHERE question_id = "${req.params.question}"`,
      (err, rows) => {
        if (err) {
          res.status(500).send();
        } else {
          res.json(rows);
        }
      }
    );
  } else if (parseInt(req.params.type) === 2) {
    connection.query(
      `SELECT input, output FROM programming_question_template WHERE question_id = "${req.params.question}"`,
      (err, rows) => {
        if (err) {
          res.status(500).send();
        } else {
          res.json(rows);
        }
      }
    );
  } else if (parseInt(req.params.type) === 3) {
    connection.query(
      `SELECT alternative AS description FROM mult_choice_question_alternatives WHERE question_id = "${req.params.question}";SELECT answer AS checked FROM mult_choice_question_template WHERE question_id = "${req.params.question}"`,
      (err, rows) => {
        if (err) {
          res.status(500).send();
        } else {
          res.json({ alternatives: rows[0], correct: rows[1] });
        }
      }
    );
  }
});

//insert a test
app.post("/api/newTest", (req, res) => {
  const sqlTest = `INSERT INTO test VALUES (NULL, "${req.body.testName}");SELECT test_id FROM test WHERE name = "${req.body.testName}"`;
  connection.query(sqlTest, [1, 2], (err, rows) => {
    const string = JSON.stringify(rows[1]);
    const exam = JSON.parse(string);
    if (err) {
      res.status(500).send();
    } else {
      res.json(exam);
    }
  });
});

//create test relation
app.post("/api/newTestRel", (req, res) => {
  const sqlTest = `INSERT INTO rel_test_questions VALUES (NULL, "${req.body.testId}", "${req.body.questionId}", "${req.body.value}", "${req.body.compilation}")`;
  connection.query(sqlTest, (err, rows) => {
    if (err) {
      res.status(500).send();
    } else {
      res.json(rows);
    }
  });
});

function promiseQuery(query) {
  return new Promise((resolve, reject) => {
    connection.query(query, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

//get a student test
app.post("/api/student_questions", async (req, res) => {
  const sqlTest = `SELECT question_id FROM rel_test_questions WHERE test_id = ${req.body.testId}`;
  const question_rows = await promiseQuery(sqlTest);
  const array = await Promise.all(
    question_rows.map((question) => {
      const questionSql = `SELECT description, type FROM question WHERE question_id = ${question.question_id}`;
      return promiseQuery(questionSql);
    })
  );
  //console.log(JSON.stringify(array.flat(1)));
  res.json(array.flat(1));
});

//inserting a new topic in the database
app.post("/api/subject/newTopic", (req, res) => {
  connection.query(
    `INSERT INTO topic VALUES (NULL, "${req.body.id}", "${req.body.newTopic}")`,
    (err, rows) => {
      if (err) {
        res.status(500).send();
      } else {
        res.json(rows);
      }
    }
  );
});

//inserting a new question in the database
app.post("/api/addQuestion", (req, res) => {
  const sqlTest = `SELECT question_id FROM question WHERE title = "${req.body.title}" OR description = "${req.body.description}"`;
  connection.query(sqlTest, (err, rows) => {
    if (rows[0] === undefined) {
      const sql = `INSERT INTO question VALUES (NULL, ${req.body.topic}, "${req.body.description}", "${req.body.title}", ${req.body.type}, ${req.body.difficulty}); SELECT question_id FROM question WHERE title = "${req.body.title}"`;
      connection.query(sql, [1, 2], (err, rows) => {
        const string = JSON.stringify(rows[1]);
        const question = JSON.parse(string);
        if (req.body.type === 1) {
          connection.query(
            `INSERT INTO discursive_question_template VALUES (NULL,"${req.body.answer}" , ${question[0].question_id})`
          );
          res.status(200).send({ id: question[0].question_id });
        } else if (req.body.type === 2) {
          req.body.inOutList.map((pairInputOutput) => {
            connection.query(
              `INSERT INTO programming_question_template VALUES (NULL, ${question[0].question_id}, "${pairInputOutput.input}" , "${pairInputOutput.output}")`
            );
          });
          res.status(200).send({ id: question[0].question_id });
        } else if (req.body.type === 3) {
          req.body.multipleChoiceAnswer.map((multipleChoice, index) => {
            if (multipleChoice.checked) {
              connection.query(
                `INSERT INTO mult_choice_question_template VALUES (NULL, "${index}" ,${question[0].question_id})`
              );
            }
            connection.query(
              `INSERT INTO mult_choice_question_alternatives VALUES (NULL, "${multipleChoice.description}", ${question[0].question_id})`
            );
          });
          res.status(200).send({ id: question[0].question_id });
        }
      });
    } else {
      res.send({ id: rows[0].question_id });
    }
  });
});

//compiling student programming question
app.post("/api/compile", (req, res) => {
  var cmd = `gcc question${req.body.id}.c -o question${req.body.id} && echo Compilado com sucesso. O programa pode ser executado.`;
  fs.writeFileSync(`question${req.body.id}.c`, req.body.resp);
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.log(`error: ${error.message}`);
      //res.status(500).send();
    }
    if (stderr) {
      console.log(`stderr: ${stderr}`);
      res.send({ output: stderr });
      //res.status(500).send();
    } else if (stdout) {
      console.log(`stdout: ${stdout}`);
      res.send({
        output: stdout,
      });
    }
    //res.send({ output: stdout });
  });
});

//execute student programming question
app.post("/api/execute", (req, res) => {
  var cmd = `question${req.body.id}.exe`;
  if (req.body.input) {
    fs.writeFileSync("input.txt", req.body.input);
    cmd = `question${req.body.id}.exe < input.txt`;
  }
  exec(cmd, { timeout: 2000 }, (error, stdout, stderr) => {
    if (error) {
      console.log(`error: ${error.message}`);
      res.send({
        output:
          "O programa demorou mais de 2 segundos para responder e foi aniquilado.",
      });
    } else if (stderr) {
      console.log(`stderr: ${stderr}`);
      res.send({ output: stderr });
    } else if (stdout) {
      console.log(`stdout: ${stdout}`);
      res.send({ output: stdout });
    }
  });
});

//init
app.listen(4000, () => {
  console.log(`Listening...`);
});
