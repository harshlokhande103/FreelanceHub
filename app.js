const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const { auth, db } = require('./config/firebase');
const { createUserWithEmailAndPassword } = require('firebase/auth');
const { doc, setDoc } = require('firebase/firestore');
const app = express();
const { fetchSignInMethodsForEmail } = require('firebase/auth');

// Middleware Setup
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Session configuration
app.use(session({
    secret: 'freelancehub-secret-key',
    resave: false,
    saveUninitialized: true
}));

// Routes
app.get('/', (req, res) => {
    res.render('pages/index');
});

app.get('/getstarted', (req, res) => {
    res.render('pages/getstarted');
});

// Login page route
app.get('/login', (req, res) => {
    res.render('pages/login');
});

app.post('/login', (req, res) => {
    // Handle login form submission
    const { username, password } = req.body;
    // Add authentication logic here
    res.redirect('/');
});
// Add these routes to your existing app.js
// Add this with your other routes
app.get('/register-client', (req, res) => {
    res.render('pages/register-client');
});

// Add this before your registration route
async function checkEmailExists(email) {
    try {
        const methods = await fetchSignInMethodsForEmail(auth, email);
        return methods.length > 0;
    } catch (error) {
        console.error('Error checking email:', error);
        return false;
    }
}

// Then modify your registration route to check first
app.post('/register-client', async (req, res) => {
    const { firstName, lastName, email, password, country } = req.body;
    
    try {
        // Check if email exists first
        const emailExists = await checkEmailExists(email);
        if (emailExists) {
            return res.render('pages/register-client', {
                error: 'This email is already registered. Please try logging in.',
                formData: { firstName, lastName, email, country }
            });
        }

        // Continue with registration if email doesn't exist
        console.log('Attempting to register:', email);

        // Create user in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        console.log('User created in Auth:', user.uid);

        await setDoc(doc(db, 'clients', user.uid), {
            firstName,
            lastName,
            email,
            country,
            createdAt: new Date().toISOString(),
            userType: 'client'
        });

        console.log('User data stored in Firestore');
        res.redirect('/login');
    } catch (error) {
        console.error('Registration error:', error);
        
        // Handle specific error cases
        let errorMessage;
        switch (error.code) {
            case 'auth/email-already-in-use':
                errorMessage = 'This email is already registered. Please try logging in or use a different email.';
                break;
            case 'auth/weak-password':
                errorMessage = 'Password should be at least 6 characters long.';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Please enter a valid email address.';
                break;
            default:
                errorMessage = 'Registration failed. Please try again.';
        }
        res.render('pages/register-client', { 
            error: errorMessage,
            formData: { firstName, lastName, email, country }
        });
    }
});
// Add these routes to your app.js
// Add this route to handle freelancer registration page
app.get('/register-freelancer', (req, res) => {
    res.render('pages/register-freelancer');
});

app.post('/register-freelancer', async (req, res) => {
    try {
        const { name, email, password, skills } = req.body;
        
        // Create user in Firebase Authentication
        const userCredential = await auth.createUser({
            email: email,
            password: password
        });

        // Store additional data in Firestore
        await db.collection('freelancers').doc(userCredential.uid).set({
            name: name,
            email: email,
            skills: skills, // This will be stored as an array in Firebase
            createdAt: new Date()
        });

        res.redirect('/login');
    } catch (error) {
        console.error('Error registering freelancer:', error);
        res.redirect('/register/freelancer?error=Registration failed');
    }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});