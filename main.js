const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cors = require('cors');
const path = require('path');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 3000;


const uri = "mongodb+srv://maisarahliyana:mai1234@berr3123.3mg6v.mongodb.net/?retryWrites=true&w=majority&appName=berr3123";

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}
run().catch(console.dir);


app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        const existingUser = await client.db("2048_game").collection("users").findOne({ email });

        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await client.db("2048_game").collection("users").insertOne({
            username,
            email,
            password: hashedPassword,
            score: 0 // Initialize score to 0
        });

        res.status(200).json({ success: true, message: 'Registration successful' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

app.post('/login', async (req, res) => {
   try {
       const { email, password } = req.body;

       const user = await client.db("2048_game").collection("users").findOne({ email });

       if (!user) {
           return res.status(400).json({ success: false, message: 'Invalid email or password' });
       }

       const isPasswordValid = await bcrypt.compare(password, user.password);

       if (!isPasswordValid) {
           return res.status(400).json({ success: false, message: 'Invalid email or password' });
       }

       const token = jwt.sign({ id: user._id, email: user.email }, 'your_jwt_secret', { expiresIn: '1h' });

       res.status(200).json({ success: true, message: 'Login successful', token });
   } catch (error) {
       console.error(error);
       res.status(500).json({ success: false, message: 'Internal Server Error' });
   }
});

// Middleware to verify JWT
function verifyToken(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) {
        return res.status(403).json({ success: false, message: 'No token provided' });
    }

    jwt.verify(token, 'your_jwt_secret', (err, decoded) => {
        if (err) {
            console.error("Failed to authenticate token:", err);
            return res.status(500).json({ success: false, message: 'Failed to authenticate token' });
        }

        req.userId = decoded.id;
        next();
    });
}

// Middleware to verify admin access
function verifyAdmin(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) {
        return res.status(403).json({ success: false, message: 'No token provided' });
    }

    jwt.verify(token, 'your_jwt_secret', async (err, decoded) => {
        if (err) {
            console.error("Failed to authenticate token:", err);
            return res.status(500).json({ success: false, message: 'Failed to authenticate token' });
        }

        const user = await client.db("2048_game").collection("users").findOne({ _id: new ObjectId(decoded.id) });
        if (user && user.role === 'admin') {
            req.userId = decoded.id;
            next();
        } else {
            res.status(403).json({ success: false, message: 'Admin access required' });
        }
    });
}

// Endpoint to delete a user (Admin only)
app.delete('/admin/deleteUser/:id', verifyAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        const result = await client.db("2048_game").collection("users").deleteOne({ _id: new ObjectId(userId) });

        if (result.deletedCount === 1) {
            res.status(200).json({ success: true, message: 'User deleted successfully' });
        } else {
            res.status(404).json({ success: false, message: 'User not found' });
        }
    } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// Endpoint to view all users (Admin only)
app.get('/admin/viewUsers', verifyAdmin, async (req, res) => {
    try {
        const users = await client.db("2048_game").collection("users").find().toArray();
        res.status(200).json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// Endpoint to save the score
app.post('/saveScore', verifyToken, async (req, res) => {
    try {
        const { score } = req.body;
        console.log("Received score:", score);
        console.log("User ID from token:", req.userId);

        const user = await client.db("2048_game").collection("users").findOne({ _id: new ObjectId(req.userId) });

        if (user) {
            if (score > user.score) {
                const result = await client.db("2048_game").collection("users").updateOne(
                    { _id: new ObjectId(req.userId) },
                    { $set: { score: score } }
                );

                if (result.modifiedCount === 1) {
                    res.status(200).json({ success: true, message: 'New high score saved successfully' });
                } else {
                    console.error("Failed to update score in the database");
                    res.status(500).json({ success: false, message: 'Failed to save score' });
                }
            } else {
                console.log("New score is not higher than your current score");
                res.status(200).json({ success: false, message: 'New score is not higher than your current score' });
            }
        } else {
            console.error("User not found");
            res.status(404).json({ success: false, message: 'User not found' });
        }
    } catch (error) {
        console.error("Error in /saveScore endpoint:", error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

app.get('/leaderboard', async (req, res) => {
    try {
        const leaderboard = await client.db("2048_game").collection("users")
            .find({}, { sort: { score: -1 } })
            .toArray();
        res.status(200).json(leaderboard);
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

app.listen(port, () => {
   console.log(`App listening on port ${port}`);
});

