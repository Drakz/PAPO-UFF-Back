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
  database: "tcc-database2",
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
  const sql = `SELECT user_id, nome,cargo FROM user WHERE username = "${req.body.loginName}" AND password = "${req.body.password}"`;
  connection.query(sql, (err, rows) => {
    if (err) {
      res.status(500).send();
    }
    if (rows[0] === undefined) {
      const sqlTest = `INSERT INTO student VALUES (NULL, "${req.body.loginName}", "${req.body.password}");SELECT student_id, name FROM student WHERE name = "${req.body.loginName}"`;
      connection.query(sqlTest, [1, 2], (err, rows) => {
        const string = JSON.stringify(rows[1]);
        const student = JSON.parse(string);
        if (err) {
          res.status(500).send();
        } else {
          res.json({
            name: student[0].name,
            url: "/aluno",
            id: student[0].student_id,
          });
        }
      });
    } else if (rows[0].cargo === 0) {
      res.send({ url: "/aluno" });
      return;
    } else if (rows[0].cargo === 1) {
      console.log(rows[0].user_id);
      res.send({ url: "/professor/perfil", user_id: rows[0].user_id });
      return;
    }
  });
});

//new student question
app.post("/api/newStudentQuestion", (req, res) => {
  const sqlTest = `INSERT INTO student_question VALUES (NULL, '${req.body.answer}', '${req.body.time}', '${req.body.type}', '${req.body.comp}', '${req.body.testId}', '${req.body.studentId}', '${req.body.questionId}', '${req.body.totalValue}', '0', 'false', 'Placeholder')`;
  connection.query(sqlTest, (err, rows) => {
    if (err) {
      res.status(500).send();
    } else {
      res.json({ url: "/login" });
    }
  });
});

//getting tests
app.post("/api/tests", (req, res) => {
  const sql = `SELECT test_id, name FROM test WHERE prof_id = '${req.body.prof_id}'`;
  connection.query(sql, (err, rows) => {
    if (err) {
      res.status(500).send();
    } else {
      res.json(rows);
    }
  });
});

//getting a test
app.post("/api/test", (req, res) => {
  const sql = `SELECT name FROM test WHERE test_id = '${req.body.test_id}'`;
  connection.query(sql, (err, rows) => {
    if (err) {
      res.status(500).send();
    } else {
      res.json(rows);
    }
  });
});

//getting a test
app.post("/api/test_students", (req, res) => {
  const sql = `SELECT DISTINCT student_id FROM student_question WHERE test_id = '${req.body.test_id}'`;
  connection.query(sql, (err, rows) => {
    if (err) {
      res.status(500).send();
    } else {
      res.json(rows.flat(1));
    }
  });
});

//getting a test
app.post("/api/students", (req, res) => {
  const sql = `SELECT student_id, name FROM student WHERE student_id IN (${req.body.student_ids})`;
  connection.query(sql, (err, rows) => {
    if (err) {
      res.status(500).send();
    } else {
      res.json(rows.flat(1));
    }
  });
});

//getting a test
app.post("/api/students_answer", (req, res) => {
  const sql = `SELECT student_question_id, student_id, answer, comp, type, total_value, checked, value, question_id, feedback, time FROM student_question WHERE student_id IN (${req.body.student_ids}) AND test_id = ${req.body.test_id} ORDER BY question_id`;
  connection.query(sql, (err, rows) => {
    if (err) {
      res.status(500).send();
    } else {
      res.json(rows.flat(1));
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
      if (rows[0].topic === undefined) {
        res.json({ topic: "Nenhuma Questão" });
      } else {
        res.json(rows);
      }
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
      if (rows[0] === undefined) {
        res.json({ title: "Nenhuma Questão" });
      } else {
        res.json(rows);
      }
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
  const sqlTest = `INSERT INTO test VALUES (NULL, "${req.body.testName}", "${req.body.prof_id}");SELECT test_id FROM test WHERE name = "${req.body.testName}"`;
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

//create test relation
app.post("/api/updateQuestionScore", (req, res) => {
  const sqlTest = `UPDATE student_question SET value = '${req.body.newValue}', checked = '1', feedback = '${req.body.feedback}' WHERE student_question_id = '${req.body.question_id}';`;
  connection.query(sqlTest, (err, rows) => {
    if (err) {
      res.status(500).send();
    } else {
      res.status(200).send();
    }
  });
});

app.post("/api/updateQuestionNewScore", (req, res) => {
  const sqlTest = `UPDATE student_question SET value = '${req.body.newValue}', feedback = '${req.body.feedback}' WHERE student_question_id = '${req.body.question_id}';`;
  connection.query(sqlTest, (err, rows) => {
    if (err) {
      res.status(500).send();
    } else {
      res.status(200).send();
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
  const sqlTest = `SELECT question_id, compilations, value FROM rel_test_questions WHERE test_id = ${req.body.testId}`;
  const question_rows = await promiseQuery(sqlTest);
  const array = await Promise.all(
    question_rows.map(async (question) => {
      const questionSql = `SELECT question_id, description, type FROM question WHERE question_id = ${question.question_id}`;
      const currentQuestion = await promiseQuery(questionSql);
      currentQuestion[0].compilations = question.compilations;
      currentQuestion[0].value = question.value;
      if (currentQuestion[0].type === 3) {
        const alternativeSql = `SELECT alternative FROM mult_choice_question_alternatives WHERE question_id = ${question.question_id}`;
        currentQuestion[0].alt = await promiseQuery(alternativeSql);
      }
      return currentQuestion;
    })
  );
  res.json(array.flat(1));
});

//get test for professor
app.post("/api/professor_questions", async (req, res) => {
  const sqlTest = `SELECT question_id, compilations FROM rel_test_questions WHERE test_id = ${req.body.test_id}`;
  const question_rows = await promiseQuery(sqlTest);
  const array = await Promise.all(
    question_rows.map(async (question) => {
      const questionSql = `SELECT question_id, description, type, title, difficulty FROM question WHERE question_id = ${question.question_id}`;
      const currentQuestion = await promiseQuery(questionSql);
      currentQuestion[0].compilations = question.compilations;
      if (currentQuestion[0].type === 1) {
        const answer = `SELECT answer FROM discursive_question_template WHERE question_id = ${question.question_id}`;
        currentQuestion[0].answer = await promiseQuery(answer);
      } else if (currentQuestion[0].type === 2) {
        const answer = `SELECT input, output FROM programming_question_template WHERE question_id = ${question.question_id}`;
        currentQuestion[0].answer = await promiseQuery(answer);
      } else if (currentQuestion[0].type === 3) {
        const alternativeSql = `SELECT alternative FROM mult_choice_question_alternatives WHERE question_id = ${question.question_id}`;
        currentQuestion[0].alt = await promiseQuery(alternativeSql);
        const answer = `SELECT answer FROM mult_choice_question_template WHERE question_id = ${question.question_id}`;
        currentQuestion[0].answer = await promiseQuery(answer);
      }
      return currentQuestion;
    })
  );
  res.json(array.flat(1));
});

//get student alternatives
app.post("/api/student_alternatives", async (req, res) => {
  const sqlTest = `SELECT alternative FROM mult_choice_question_alternatives WHERE question_id = ${req.body.questionId}`;
  const question_rows = await promiseQuery(sqlTest);
  res.json(question_rows.flat(1));
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
  const sqlTest = `SELECT question_id FROM question WHERE title = '${req.body.title}' OR description = '${req.body.description}'`;
  connection.query(sqlTest, (err, rows) => {
    if (rows === undefined) {
      res.status(500).send();
    }
    if (rows[0] === undefined) {
      const sql = `INSERT INTO question VALUES (NULL, '${req.body.topic}', '${req.body.description}', '${req.body.title}', '${req.body.type}', '${req.body.difficulty}'); SELECT question_id FROM question WHERE title = '${req.body.title}'`;
      connection.query(sql, (err, rows) => {
        const string = JSON.stringify(rows[1]);
        const question = JSON.parse(string);
        if (req.body.type === 1) {
          connection.query(
            `INSERT INTO discursive_question_template VALUES (NULL, '${req.body.answer}' , '${question[0].question_id}')`
          );
          res.status(200).send({ id: question[0].question_id });
        } else if (req.body.type === 2) {
          req.body.inOutList.map((pairInputOutput) => {
            connection.query(
              `INSERT INTO programming_question_template VALUES (NULL, '${question[0].question_id}', '${pairInputOutput.input}' , '${pairInputOutput.output}')`
            );
          });
          res.status(200).send({ id: question[0].question_id });
        } else if (req.body.type === 3) {
          req.body.multipleChoiceAnswer.map((multipleChoice, index) => {
            if (multipleChoice.checked) {
              connection.query(
                `INSERT INTO mult_choice_question_template VALUES (NULL, '${index}' ,'${question[0].question_id}')`
              );
            }
            connection.query(
              `INSERT INTO mult_choice_question_alternatives VALUES (NULL, '${multipleChoice.description}', '${question[0].question_id}')`
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
  var cmd = `gcc question${req.body.id}-${req.body.student_id}.c -o question${req.body.id}-${req.body.student_id} && echo Compilado com sucesso. O programa pode ser executado.`;
  fs.writeFileSync(
    `question${req.body.id}-${req.body.student_id}.c`,
    req.body.resp
  );
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
  var cmd = `question${req.body.id}-${req.body.student_id}.exe`;
  if (req.body.input) {
    fs.writeFileSync(
      `input${req.body.id}-${req.body.student_id}-${req.body.index}.txt`,
      req.body.input
    );
    cmd = `question${req.body.id}-${req.body.student_id}.exe < input${req.body.id}-${req.body.student_id}-${req.body.index}.txt`;
  }
  exec(cmd, { timeout: 2000 }, (error, stdout, stderr) => {
    if (error) {
      var errorHandle = `taskkill /f /im question${req.body.id}-${req.body.student_id}.exe`;
      exec(errorHandle);
      console.log(`error: ${error.message}`);
      res.send({
        output:
          "O programa demorou mais de 2 segundos para responder e foi aniquilado.",
      });
    } else if (stderr) {
      console.log(`stderr: ${stderr}`);
      res.send({ output: stderr });
    } else if (stdout) {
      console.log(
        `stdout [Student ID: ${req.body.student_id}] [Input: ${req.body.input}] [Question ID: ${req.body.id}]: ${stdout}`
      );
      res.send({ output: stdout });
    }
  });
});

//init
app.listen(4000, () => {
  console.log(`Listening...`);
});
