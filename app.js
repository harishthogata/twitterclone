const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API 1

app.post("/register/", async (request, response) => {
  const { name, username, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  const checkUserDetails = `SELECT *
    FROM
    user 
    WHERE
    username = '${username}';`;
  const dbUser = await db.get(checkUserDetails);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createNewUser = `
            INSERT INTO user(name, username, password, gender)
            VALUES(
                '${name}',
                '${username}',
                '${hashedPassword}',
                '${gender}'
            );`;
      await db.run(createNewUser);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const checkForUser = `
    SELECT 
    *
    FROM
    user
    WHERE
    username = '${username}';`;
  const dbUser = await db.get(checkForUser);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isMatched = await bcrypt.compare(password, dbUser.password);
    if (isMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      console.log(jwtToken);
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const getUser = async (username) => {
  const userQuery = `
  SELECT 
    user_id 
    FROM 
      user
    WHERE username='${username}';`;
  const userId = await db.get(userQuery);
  return userId.user_id;
};

//API 3

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const userId = await getUser(username);

  const getTweetDetails = `SELECT
        DISTINCT(username), tweet, date_time
    FROM 
        user INNER JOIN tweet ON user.user_id = tweet.user_id
        INNER JOIN follower ON tweet.user_id = follower.follower_user_id
   
    ORDER BY date_time DESC
    LIMIT 4;`;
  const dbUser = await db.all(getTweetDetails);
  const covertToCamelCase = (user) => {
    return {
      username: user["username"],
      tweet: user["tweet"],
      dateTime: user["date_time"],
    };
  };

  response.send(dbUser.map((user) => covertToCamelCase(user)));
});

//API 4

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const userId = await getUser(username);
  const getTweetDetails = `SELECT
        name
    FROM 
        user INNER JOIN follower ON user.user_id = follower.following_user_id
    WHERE
     follower.follower_user_id= ${userId};`;

  const dbUser = await db.all(getTweetDetails);
  const covertToCamelCase = (user) => {
    return {
      name: user.name,
    };
  };

  response.send(dbUser.map((user) => covertToCamelCase(user)));
});

//API 5

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;

  const userId = await getUser(username);

  const getTweetDetails = `SELECT
        DISTINCT name
    FROM 
        user INNER JOIN follower ON user.user_id = follower.follower_user_id
    WHERE
     follower.following_user_id= ${userId} 
    ;
`;
  const dbUser = await db.all(getTweetDetails);

  const covertToCamelCase = (user) => {
    return {
      name: user.name,
    };
  };

  response.send(dbUser.map((user) => covertToCamelCase(user)));
});

//API 6

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  //const { username } = request;
  const { tweetId } = request.params;

  //const userId = await getUser(username);
  const getTweetDetails = `SELECT
        tweet,
        count(reply) AS replies,
        count(like_id)AS likes,
        date_time
    FROM 
        tweet 
        INNER JOIN reply ON tweet.user_id = reply.user_id
        INNER JOIN like ON tweet.user_id = like.user_id
        INNER JOIN follower ON tweet.user_id = follower.following_user_id
        INNER JOIN user ON user.user_id = tweet.user_id
    WHERE
        tweet.tweet_id = ${tweetId};`;
  const dbUser = await db.get(getTweetDetails);
  if (dbUser === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send({
      tweet: dbUser["tweet"],
      replies: dbUser["replies"],
      likes: dbUser["likes"],
      dateTime: dbUser["date_time"],
    });
  }
});

//API 7

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweetDetails = `SELECT
        DISTINCT user.username
   
    FROM tweet LEFT JOIN like ON tweet.tweet_id = like.tweet_id
        LEFT JOIN user  ON like.user_id = user.user_id
    WHERE
        tweet.tweet_id = '${tweetId}'
    ;`;
    const dbUser = await db.all(getTweetDetails);

    if (dbUser === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const userNamesList = dbUser.map((user) => user["username"]);
      response.send({ likes: userNamesList });
    }
  }
);

//API 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweetDetails = `SELECT
        DISTINCT(user.username), reply
   
    FROM tweet LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
        LEFT JOIN user 
    WHERE
        tweet.tweet_id = '${tweetId}'
    ;`;
    const dbUser = await db.all(getTweetDetails);
    if (dbUser === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const userNamesList = dbUser.map((user) => {
        return {
          name: user["username"],
          reply: user["reply"],
        };
      });
      response.send({ replies: userNamesList });
    }
  }
);

//API 9

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const userId = await getUser(username);

  const getTweetDetails = `SELECT 
    tweet,
    COUNT(*) AS likes,
   (SELECT COUNT(*) AS replies
  FROM 
    tweet 
   INNER JOIN 
     reply ON tweet.tweet_id=reply.tweet_id
   WHERE tweet.user_id=${userId}
   GROUP BY tweet.tweet_id) AS replies,tweet.date_time
   FROM tweet
   INNER JOIN like ON tweet.tweet_id=like.tweet_id
   WHERE tweet.user_id=${userId}
   GROUP BY tweet.tweet_id
    ;`;
  const dbUser = await db.all(getTweetDetails);

  if (dbUser === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const userNamesList = dbUser.map((user) => {
      return {
        tweet: user["tweet"],
        likes: user["likes"],
        replies: user["replies"],
        dateTime: user["date_time"],
      };
    });
    response.send(userNamesList);
  }
});

//API 10

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const userId = await getUser(username);
  const { tweet } = request.body;
  const createNewTweet = `
        INSERT INTO
           tweet    
        (tweet,user_id)
        VALUES
           ('${tweet}','${userId}');
  `;
  const dbUser = await db.run(createNewTweet);
  response.send("Created a Tweet");
});

//API 11

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const userId = await getUser(username);
    const { tweetId } = request.params;

    const checkTweet = `SELECT 
    * FROM
    tweet
    WHERE
    tweet_id = '${tweetId}';`;
    const dbUser = await db.get(checkTweet);

    if (dbUser === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweet = `
            DELETE FROM tweet
            WHERE 
            tweet_id = '${tweetId}';
                `;
      await db.run(deleteTweet);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
