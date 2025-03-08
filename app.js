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
}); // Added closing bracket and semicolon for login route

// Add middleware to protect dashboard route
const requireClientAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    if (req.session.user.userType !== 'client') {
        return res.redirect('/login');
    }
    next();
}; // Added closing bracket and semicolon for requireClientAuth
// Update dashboard route to use middleware and fetch jobs
app.get('/client-dashboard', requireClientAuth, async (req, res) => {
    try {
        // Get user data from session
        const user = req.session.user;
        // Fetch jobs posted by this client
        const jobsRef = collection(db, 'jobs');
        const q = query(
            jobsRef, 
            where('clientId', '==', user.uid),
            orderBy('createdAt', 'desc')
        );
        const jobsSnapshot = await getDocs(q);
        const jobs = [];
        jobsSnapshot.forEach(doc => {
            jobs.push({
                id: doc.id,
                ...doc.data()
            });
        });
        // Temporarily use a simpler query until the index is created
        const notificationsRef = collection(db, 'notifications');
        const notificationQuery = query(
            notificationsRef,
            where('clientId', '==', user.uid)
        );
        // Note: The mark-notification-read route should be outside this route
        // This is causing issues with your app structure
        const notificationsSnapshot = await getDocs(notificationQuery);
        const notifications = [];
        notificationsSnapshot.forEach(doc => {
            const notification = doc.data();
            // Filter unread notifications in JavaScript instead of in the query
            if (notification.read === false) {
                notifications.push({
                    id: doc.id,
                    ...notification
                });
            }
        });
        // Sort notifications by createdAt in JavaScript
        notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.render('pages/client-dashboard', { 
            user,
            jobs,
            notifications,
            notificationCount: notifications.length,
            message: req.query.message || null
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.redirect('/login');
    }
}); // Added closing bracket and semicolon for client-dashboard route
// Add middleware to protect freelancer dashboard route
const requireFreelancerAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    if (req.session.user.userType !== 'freelancer') {
        return res.redirect('/login');
    }
    next();
}; // Added closing bracket and semicolon for requireFreelancerAuth
// Add route to handle job interest
app.get('/show-interest/:jobId', requireFreelancerAuth, async (req, res) => {
    try {
        const jobId = req.params.jobId;
        const freelancer = req.session.user;
        // Get job details
        const jobDoc = await getDoc(doc(db, 'jobs', jobId));
        if (!jobDoc.exists()) {
            return res.redirect('/freelancer-dashboard?message=Job not found');
        }
        const jobData = jobDoc.data();
        const clientId = jobData.clientId;
        // Create a notification in Firestore
        const notificationsRef = collection(db, 'notifications');
        await addDoc(notificationsRef, {
            type: 'job_interest',
            jobId: jobId,
            jobTitle: jobData.title,
            freelancerId: freelancer.uid,
            freelancerName: freelancer.name,
            clientId: clientId,
            createdAt: new Date().toISOString(),
            read: false
        });
        // Redirect back to dashboard with success message
        return res.redirect('/freelancer-dashboard?message=Interest shown successfully! The client will be notified.');
        
    } catch (error) {
        console.error('Error showing interest:', error);
        return res.redirect('/freelancer-dashboard?message=Error showing interest in job');
    }
}); // Added closing bracket and semicolon for show-interest route
// Fix the register-freelancer route
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
}); // Added closing bracket and semicolon for register-freelancer route
// Fix the post-job route
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
}); // Added closing bracket and semicolon for post-job route
// Fix the delete-job route
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
}); // Added closing bracket and semicolon for delete-job route
// Fix the results route
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
}); // Added closing bracket and semicolon for results route
// Fix the freelancer-login route
app.post('/freelancer-login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Attempt to sign in with Firebase Auth
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Get additional user data from Firestore
        const userDoc = await getDoc(doc(db, 'freelancers', user.uid));
        
        if (!userDoc.exists()) {
            // User not found in freelancers collection
            await auth.signOut();
            return res.render('pages/login', { 
                error: 'Access denied. Please login with a freelancer account.' 
            });
        }

        const userData = userDoc.data();
        
        // Check if user type is freelancer
        if (userData.userType !== 'freelancer') {
            // Wrong user type
            await auth.signOut();
            return res.render('pages/login', { 
                error: 'Access denied. Please login with a freelancer account.' 
            });
        }

        // Store user data in session
        req.session.user = {
            uid: user.uid,
            email: user.email,
            name: userData.name,
            skills: userData.skills,
            userType: userData.userType
        };

        // Redirect to freelancer dashboard
        res.redirect('/freelancer-dashboard');

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
}); // Added closing bracket and semicolon for freelancer-login route
// Fix the freelancer-dashboard route
app.get('/freelancer-dashboard', requireFreelancerAuth, async (req, res) => {
    try {
        // Get user data from session
        const user = req.session.user;
        
        // Fetch available jobs that match freelancer skills
        const jobsRef = collection(db, 'jobs');
        let availableJobs = [];
        
        // Get all open jobs
        const jobsSnapshot = await getDocs(query(jobsRef, where('status', '==', 'open')));
        
        jobsSnapshot.forEach(doc => {
            const job = {
                id: doc.id,
                ...doc.data()
            };
            
            // Check if any of the job skills match freelancer skills
            const hasMatchingSkill = job.skills.some(skill => 
                user.skills.includes(skill)
            );
            
            if (hasMatchingSkill) {
                availableJobs.push(job);
            }
        });
        
        // Render the freelancer dashboard with available jobs
        res.render('pages/freelancer-dashboard', {
            user,
            availableJobs,
            message: req.query.message || null
        });
        
    } catch (error) {
        console.error('Dashboard error:', error);
        res.redirect('/login');
    }
}); // Added closing bracket and semicolon for freelancer-dashboard route
// Move this route outside of the client-dashboard route
app.get('/mark-notification-read/:id', requireClientAuth, async (req, res) => {
try {
const notificationId = req.params.id;
const notificationRef = doc(db, 'notifications', notificationId);

// Check if notification exists and belongs to this client
const notificationDoc = await getDoc(notificationRef);
if (!notificationDoc.exists()) {
return res.redirect('/client-dashboard?message=Notification not found');
}

const notificationData = notificationDoc.data();
if (notificationData.clientId !== req.session.user.uid) {
return res.redirect('/client-dashboard?message=You do not have permission to access this notification');
}

// Mark notification as read
await setDoc(notificationRef, { read: true }, { merge: true });

res.redirect('/client-dashboard?message=Notification marked as read');
} catch (error) {
console.error('Error marking notification as read:', error);
res.redirect('/client-dashboard?message=Error updating notification');
}
}); // Added closing bracket and semicolon for mark-notification-read route
// Fix server listening code outside of any route
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
console.log(`Server is running on port ${PORT}`);
});