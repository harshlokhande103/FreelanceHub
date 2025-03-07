const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const { auth, db } = require('./config/firebase');
const { createUserWithEmailAndPassword,  fetchSignInMethodsForEmail } = require('firebase/auth');
const {  setDoc, collection, query, where, getDocs, orderBy } = require('firebase/firestore');
const app = express();
// const { fetchSignInMethodsForEmail } = require('firebase/auth');

// Middleware Setup
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Session configuration
app.use(session({
    secret: 'freelancehub-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
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

const { signInWithEmailAndPassword } = require('firebase/auth');
const { doc, getDoc } = require('firebase/firestore');

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Attempt to sign in with Firebase Auth
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Get additional user data from Firestore
        const userDoc = await getDoc(doc(db, 'clients', user.uid));
        
        if (!userDoc.exists()) {
            // User not found in clients collection
            await auth.signOut();
            return res.render('pages/login', { 
                error: 'Access denied. Please login with a client account.' 
            });
        }

        const userData = userDoc.data();
        
        // Check if user type is client
        if (userData.userType !== 'client') {
            // Wrong user type
            await auth.signOut();
            return res.render('pages/login', { 
                error: 'Access denied. Please login with a client account.' 
            });
        }

        // Store user data in session
        req.session.user = {
            uid: user.uid,
            email: user.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            userType: userData.userType
        };

        // Redirect to client dashboard
        res.redirect('/client-dashboard');

    } catch (error) {
        console.error('Login error:', error);
        let errorMessage;
        
        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage = 'No account found with this email.';
                break;
            case 'auth/wrong-password':
                errorMessage = 'Invalid password.';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Invalid email format.';
                break;
            default:
                errorMessage = 'Login failed. Please try again.';
        }
        
        res.render('pages/login', { error: errorMessage });
    }
});

// Add middleware to protect dashboard route
const requireClientAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    if (req.session.user.userType !== 'client') {
        return res.redirect('/login');
    }
    next();
};

// Update dashboard route to use middleware
app.get('/client-dashboard', requireClientAuth, (req, res) => {
    res.render('pages/client-dashboard', { 
        user: req.session.user,
        message: req.query.message || null,
        jobs: [] // Add empty jobs array to prevent undefined errors
    });
});// Add these routes to your app.js
// Add this route to handle freelancer registration page
app.get('/register-freelancer', (req, res) => {
    res.render('pages/register-freelancer');
});

app.post('/register-freelancer', async (req, res) => {
    try {
        console.log('Form data received:', req.body);
        const { name, email, password, skills } = req.body;
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            return res.render('pages/register-freelancer', {
                error: 'Please enter a valid email address.',
                formData: { name, email, skills }
            });
        }
        
        // First check if email exists in clients collection
        const clientsRef = collection(db, 'clients');
        const clientQuery = query(clientsRef, where('email', '==', email));
        const clientSnapshot = await getDocs(clientQuery);
        
        if (!clientSnapshot.empty) {
            return res.render('pages/register-freelancer', {
                error: 'This email is already registered as a client. Please use a different email.',
                formData: { name, email, skills }
            });
        }

        // Check if email exists in freelancers collection
        const freelancersRef = collection(db, 'freelancers');
        const freelancerQuery = query(freelancersRef, where('email', '==', email));
        const freelancerSnapshot = await getDocs(freelancerQuery);
        
        if (!freelancerSnapshot.empty) {
            return res.render('pages/register-freelancer', {
                error: 'This email is already registered as a freelancer. Please login instead.',
                formData: { name, email, skills }
            });
        }

        // Create user in Firebase Authentication
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Store additional data in Firestore freelancers collection
        await setDoc(doc(db, 'freelancers', user.uid), {
            name: name,
            email: email,
            skills: Array.isArray(skills) ? skills : [skills], // Ensure skills is always an array
            createdAt: new Date().toISOString(),
            userType: 'freelancer'
        });

        // Redirect to login page with success message
        res.redirect('/login?message=Registration successful! Please login.');

    } catch (error) {
        console.error('Error registering freelancer:', error);
        res.render('pages/register-freelancer', {
            error: 'Registration failed. Please try again.',
            formData: req.body
        });
    }
});// Add this route to handle client dashboard
// Remove this duplicate client-dashboard route and the nested search route
app.get('/client-dashboard', (req, res) => {
    // Mock user data - replace with actual user data from your database
    const user = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com'
    };
    res.render('pages/client-dashboard', { user: user });
});// Add this route to display the job posting form
app.get('/post-job', (req, res) => {
    // Check if user is logged in
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.render('pages/post-job');
});// Add this route to handle job posting submission
// Fix the post-job route by properly closing it
// This route already handles storing job data in Firebase
app.post('/post-job', async (req, res) => {
    try {
        // Check if user is logged in
        if (!req.session.user) {
            return res.redirect('/login');
        }
    
        const { projectDuration, jobTitle, jobDescription, skills, budgetType, budget } = req.body;
        
        // Create a new job document in Firestore
        const jobsRef = collection(db, 'jobs');
        const newJobRef = doc(jobsRef);
        
        await setDoc(newJobRef, {
            clientId: req.session.user.uid,
            clientName: `${req.session.user.firstName} ${req.session.user.lastName}`,
            projectDuration,
            title: jobTitle,
            description: jobDescription,
            skills: Array.isArray(skills) ? skills : [skills],
            budgetType,
            budget: parseFloat(budget),
            status: 'open',
            createdAt: new Date().toISOString()
        });
        
        // Redirect to client dashboard with success message
        res.redirect('/client-dashboard?message=Job posted successfully!');
    } catch (error) {
        console.error('Error posting job:', error);
        res.render('pages/post-job', {
            error: 'Failed to post job. Please try again.',
            formData: req.body
        });
    }
});

// Move this route outside of post-job route
app.get('/delete-job/:id', requireClientAuth, async (req, res) => {
    try {
        const jobId = req.params.id;
        const jobRef = doc(db, 'jobs', jobId);
        
        // Check if job exists and belongs to this client
        const jobDoc = await getDoc(jobRef);
        if (!jobDoc.exists()) {
            return res.redirect('/client-dashboard?message=Job not found');
        }
        
        const jobData = jobDoc.data();
        if (jobData.clientId !== req.session.user.uid) {
            return res.redirect('/client-dashboard?message=You do not have permission to delete this job');
        }
        
        // Delete the job
        await deleteDoc(jobRef);
        
        res.redirect('/client-dashboard?message=Job deleted successfully');
    } catch (error) {
        console.error('Error deleting job:', error);
        res.redirect('/client-dashboard?message=Error deleting job');
    }
});

// Move this route outside of post-job route
app.get('/results', async (req, res) => {
    try {
        const searchQuery = req.query.skill;
        
        if (!searchQuery) {
            return res.redirect('/');
        }

        // Query Firestore for freelancers with matching skills
        const freelancersRef = collection(db, 'freelancers');
        const q = query(freelancersRef, where('skills', 'array-contains', searchQuery));
        const querySnapshot = await getDocs(q);
        
        const freelancers = [];
        querySnapshot.forEach(doc => {
            freelancers.push({
                id: doc.id,
                ...doc.data()
            });
        });

        res.render('pages/results', {
            searchQuery: searchQuery,
            freelancers: freelancers
        });
    } catch (error) {
        console.error('Search error:', error);
        res.render('pages/results', {
            searchQuery: req.query.skill || '',
            freelancers: [],
            error: 'An error occurred while searching. Please try again.'
        });
    }
});

// Move server listening code outside of any route
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});