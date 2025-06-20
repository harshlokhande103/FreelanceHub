const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const { auth, db } = require('./config/firebase');
// Make sure these imports are at the top of your app.js file
const { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut,
    fetchSignInMethodsForEmail 
} = require('firebase/auth');

const { 
    getFirestore, 
    collection, 
    doc, 
    getDoc, 
    setDoc, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where,
    orderBy,  // Add this import
    getDocs 
} = require('firebase/firestore');
const app = express();

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
app.get('/register-client', (req, res) => {
    res.render('pages/register-client');
});
// Routes को सही क्रम में रखें
app.get('/register-freelancer', (req, res) => {
    res.render('pages/register-freelancer');
});

// Freelancer registration route
app.post('/register-freelancer', async (req, res) => {
    try {
        const { name, email, password, skills } = req.body;
        
        console.log('Received freelancer registration data:', req.body);
        
        // Check if email already exists
        const methods = await fetchSignInMethodsForEmail(auth, email);
        if (methods.length > 0) {
            return res.render('pages/register-freelancer', { 
                error: 'Email already in use. Please use a different email or login.',
                formData: req.body
            });
        }
        
        // Create user in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Handle skills - could be array or string
        let skillsArray = [];
        if (Array.isArray(skills)) {
            skillsArray = skills;
        } else if (typeof skills === 'string') {
            skillsArray = skills.split(',').map(skill => skill.trim());
        }
        
        // Store additional user data in Firestore
        await setDoc(doc(db, 'freelancers', user.uid), {
            name: name,
            email: email,
            userType: 'freelancer',
            skills: skillsArray,
            createdAt: new Date().toISOString()
        });
        
        // Store user data in session
        req.session.user = {
            uid: user.uid,
            email: user.email,
            name: name,
            skills: skillsArray,
            userType: 'freelancer'
        };
        
        // Redirect to freelancer dashboard
        res.redirect('/freelancer-dashboard');
        
    } catch (error) {
        console.error('Registration error:', error);
        let errorMessage = 'Registration failed. Please try again.';
        
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Email already in use. Please use a different email.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password is too weak. Please use a stronger password.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email format.';
        }
        
        res.render('pages/register-freelancer', { 
            error: errorMessage,
            formData: req.body
        });
    }
});
// Login route
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
            await signOut(auth);
            return res.render('pages/login', { 
                error: 'Access denied. Please login with a client account.' 
            });
        }

        const userData = userDoc.data();
        
        // Check if user type is client
        if (userData.userType !== 'client') {
            // Wrong user type
            await signOut(auth);
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

// ... existing code ...

// Edit Profile Page Route
app.get('/edit-profile', async (req, res) => {
    try {
        // Check if user is logged in
        if (!req.session.user) {
            return res.redirect('/login');
        }

        // Get user data from Firestore
        const userRef = doc(db, 'freelancers', req.session.user.uid);
        const userDoc = await getDoc(userRef);
        
        if (!userDoc.exists()) {
            return res.redirect('/freelancer-dashboard');
        }
        
        const userData = userDoc.data();
        
        // Render the edit profile page with user data
        res.render('pages/edit-profile', {
            user: req.session.user,
            userData: userData
        });
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.redirect('/freelancer-dashboard');
    }
});

// Update Profile Route
app.post('/update-profile', async (req, res) => {
    try {
        // Check if user is logged in
        if (!req.session.user) {
            return res.redirect('/login');
        }
        
        const { name, phone, location, bio, skills, hourlyRate, education, experience,
            portfolioUrl, githubUrl, linkedinUrl, twitterUrl, behanceUrl, dribbbleUrl, mediumUrl, customUrl } = req.body;
        
        // Process skills array
        let skillsArray = [];
        if (Array.isArray(skills)) {
            skillsArray = skills;
        } else if (typeof skills === 'string') {
            skillsArray = skills.split(',').map(skill => skill.trim()).filter(skill => skill);
        }
        
        // Update user data in Firestore
        const userRef = doc(db, 'freelancers', req.session.user.uid);
        
        await updateDoc(userRef, {
            name: name,
            phone: phone || '',
            location: location || '',
            bio: bio || '',
            skills: skillsArray,
            hourlyRate: hourlyRate || '',
            education: education || '',
            experience: experience || '',
            portfolioUrl: portfolioUrl || '',
            githubUrl: githubUrl || '',
            linkedinUrl: linkedinUrl || '',
            twitterUrl: twitterUrl || '',
            behanceUrl: behanceUrl || '',
            dribbbleUrl: dribbbleUrl || '',
            mediumUrl: mediumUrl || '',
            customUrl: customUrl || '',
            updatedAt: new Date().toISOString()
        });
        
        // Update session data
        req.session.user.name = name;
        req.session.user.skills = skillsArray;
        
        // Redirect to dashboard with success message
        res.redirect('/freelancer-dashboard?message=Profile updated successfully');
    } catch (error) {
        console.error('Error updating profile:', error);
        res.redirect('/edit-profile?error=Failed to update profile');
    }
});

// View Profile Page Route
app.get('/view-profile', async (req, res) => {
    try {
        // Check if user is logged in
        if (!req.session.user) {
            return res.redirect('/login');
        }

        // Get user data from Firestore
        const userRef = doc(db, 'freelancers', req.session.user.uid);
        const userDoc = await getDoc(userRef);
        
        if (!userDoc.exists()) {
            return res.redirect('/freelancer-dashboard');
        }
        
        const userData = userDoc.data();
        
        // Render the view profile page with user data
        res.render('pages/view-profile', {
            user: req.session.user,
            userData: userData
        });
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.redirect('/freelancer-dashboard');
    }
});

// ... existing code ...

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

        

        // Calculate job statistics for overview
        const jobStats = {
            total: jobs.length,
            open: jobs.filter(job => job.status === 'open').length,
            inProgress: jobs.filter(job => job.status === 'in-progress').length,
            completed: jobs.filter(job => job.status === 'completed').length,
            latestJobs: jobs.slice(0, 3) // Get the 3 most recent jobs
        };

        // Fetch notifications for this client - simplified query to avoid index error
        let notifications = [];
        let notificationCount = 0;
        
        try {
            const notificationsRef = collection(db, 'notifications');
            // Simplified query that doesn't require a composite index
            const notificationQuery = query(
                notificationsRef,
                where('clientId', '==', user.uid)
            );
            
            const notificationsSnapshot = await getDocs(notificationQuery);
            
            notificationsSnapshot.forEach(doc => {
                const notification = {
                    id: doc.id,
                    ...doc.data()
                };
                // Filter unread notifications in JavaScript
                if (notification.read === false) {
                    notifications.push(notification);
                }
            });
            
            // Sort notifications by createdAt in JavaScript
            notifications.sort((a, b) => {
                return new Date(b.createdAt) - new Date(a.createdAt);
            });
            
            notificationCount = notifications.length;
        } catch (notificationError) {
            console.error('Notification fetch error:', notificationError);
            notifications = [];
            notificationCount = 0;
        }
        // When rendering, include the job statistics
        res.render('pages/client-dashboard', { 
            user,
            jobs,
            jobStats, // Add job statistics to the template
            notifications,
            notificationCount,
            message: req.query.message || null
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.redirect('/login');
    }
}); 

// Add middleware to protect freelancer routes
const requireFreelancerAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    if (req.session.user.userType !== 'freelancer') {
        return res.redirect('/login');
    }
    next();
};

// Add this new route for viewing freelancer profile
// Update the freelancer profile route
app.get('/freelancer-profile/:id', requireClientAuth, async (req, res) => {
    try {
        const freelancerId = req.params.id;
        const clientId = req.session.user.uid;

        let freelancerData = null;

        // ✅ Try to fetch from Firestore
        const freelancerDoc = await getDoc(doc(db, 'freelancers', freelancerId));

        if (freelancerDoc.exists()) {
            const data = freelancerDoc.data();
            freelancerData = {
                id: freelancerId,
                ...data
            };
        } else {
            // ⚠️ If not found in Firestore, try MongoDB
            const freelancer = await Freelancer.findById(freelancerId);
            if (!freelancer) {
                return res.redirect('/client-dashboard?message=Freelancer not found');
            }

            freelancerData = {
                id: freelancer._id,
                name: `${freelancer.firstName} ${freelancer.lastName}`,
                firstName: freelancer.firstName,
                lastName: freelancer.lastName,
                email: freelancer.email,
                title: freelancer.title || 'Freelancer',
                bio: freelancer.bio || '',
                skills: Array.isArray(freelancer.skills) ? freelancer.skills : [],
                profilePicture: freelancer.profilePicture || '',
                rating: freelancer.rating || 0,
                reviewCount: freelancer.reviewCount || 0,
                location: freelancer.location || '',
                phone: freelancer.phone || '',
                experience: Array.isArray(freelancer.experience) ? freelancer.experience : [],
                education: Array.isArray(freelancer.education) ? freelancer.education : [],
                portfolio: Array.isArray(freelancer.portfolio) ? freelancer.portfolio : [],
                reviews: Array.isArray(freelancer.reviews) ? freelancer.reviews : [],
                portfolioUrl: freelancer.portfolioUrl || '',
                githubUrl: freelancer.githubUrl || '',
                linkedinUrl: freelancer.linkedinUrl || '',
                twitterUrl: freelancer.twitterUrl || '',
                behanceUrl: freelancer.behanceUrl || '',
                dribbbleUrl: freelancer.dribbbleUrl || '',
                mediumUrl: freelancer.mediumUrl || '',
                customUrl: freelancer.customUrl || ''
            };
        }

        // 🔔 Fetch notification (if Firestore is used)
        let notification = null;
        const notificationsRef = collection(db, 'notifications');
        const notificationQuery = query(
            notificationsRef,
            where('clientId', '==', clientId),
            where('freelancerId', '==', freelancerId)
        );
        const notificationsSnapshot = await getDocs(notificationQuery);
        if (!notificationsSnapshot.empty) {
            const notificationDoc = notificationsSnapshot.docs[0];
            notification = {
                id: notificationDoc.id,
                ...notificationDoc.data()
            };
        }

        // 🔗 Check connection (only relevant to Firestore)
        let isAccepted = false;
        const connectionsRef = collection(db, 'connections');
        const connectionQuery = query(
            connectionsRef,
            where('clientId', '==', clientId),
            where('freelancerId', '==', freelancerId),
            where('status', '==', 'active')
        );
        const connectionsSnapshot = await getDocs(connectionQuery);
        if (!connectionsSnapshot.empty) {
            isAccepted = true;
        }

        // ✅ Render profile
        res.render('pages/freelancer-profile', {
            user: req.user || { firstName: 'Guest', lastName: '' },
            freelancer: freelancerData,
            notification,
            isAccepted,
            message: req.query.message || (req.flash ? req.flash('success') : null)
        });
    } catch (error) {
        console.error('Error fetching freelancer profile:', error);
        if (req.flash) req.flash('error', 'An error occurred while loading the freelancer profile');
        res.redirect('/client-dashboard');
    }
});


// Add the show-interest route
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
        
        // Create notification in Firestore
        const notificationsRef = collection(db, 'notifications');
        await addDoc(notificationsRef, {
            jobId: jobId,
            jobTitle: jobData.title,
            clientId: jobData.clientId,
            freelancerId: freelancer.uid,
            freelancerName: freelancer.name,
            read: false,
            createdAt: new Date().toISOString()
        });
        
        res.redirect('/freelancer-dashboard?message=Interest shown successfully');
    } catch (error) {
        console.error('Error showing interest:', error);
        res.redirect('/freelancer-dashboard?message=Error showing interest');
    }
});
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
        
        // Fetch notifications for this freelancer
        let notifications = [];
        let notificationCount = 0;
        
        try {
            const notificationsRef = collection(db, 'freelancerNotifications');
            const notificationQuery = query(
                notificationsRef,
                where('freelancerId', '==', user.uid)
            );
            
            const notificationsSnapshot = await getDocs(notificationQuery);
            
            notificationsSnapshot.forEach(doc => {
                const notification = {
                    id: doc.id,
                    ...doc.data()
                };
                // Filter unread notifications in JavaScript
                if (notification.read === false) {
                    notifications.push(notification);
                }
            });
            
            // Sort notifications by createdAt
            notifications.sort((a, b) => {
                return new Date(b.createdAt) - new Date(a.createdAt);
            });
            
            notificationCount = notifications.length;
        } catch (notificationError) {
            console.error('Notification fetch error:', notificationError);
            notifications = [];
            notificationCount = 0;
        }
        
        // Render the freelancer dashboard with available jobs
        res.render('pages/freelancer-dashboard', {
            user,
            availableJobs,
            notifications,
            notificationCount,
            message: req.query.message || null
        });
        
    } catch (error) {
        console.error('Dashboard error:', error);
        res.redirect('/login');
    }
});
// Post job page route - MOVED OUTSIDE OF FREELANCER DASHBOARD ROUTE
app.get('/post-job', requireClientAuth, (req, res) => {
    res.render('pages/post-job', {
        user: req.session.user,
        message: req.query.message || null
    });
});
// Post job submission route - MOVED OUTSIDE OF FREELANCER DASHBOARD ROUTE
// Post job submission route
app.post('/post-job', requireClientAuth, async (req, res) => {
    try {
        console.log('Form data received:', JSON.stringify(req.body, null, 2)); // Enhanced logging
        
        // Check if required fields exist
        if (!req.body.title || !req.body.description) {
            return res.render('pages/post-job', {
                user: req.session.user,
                message: 'Title and description are required fields',
                formData: req.body // Send back the form data to preserve user input
            });
        }
        
        const { title, description, budget, deadline, skills, projectDuration, budgetType } = req.body;
        const client = req.session.user;
        
        // Handle skills properly - check if it's a string or already an array
        let skillsArray = [];
        if (skills) {
            if (typeof skills === 'string') {
                skillsArray = skills.split(',').map(skill => skill.trim());
            } else if (Array.isArray(skills)) {
                skillsArray = skills;
            }
        }
        
        // Create job in Firestore
        const jobsRef = collection(db, 'jobs');
        await addDoc(jobsRef, {
            title: title || 'Untitled Job',
            description: description || 'No description provided',
            budget: budget ? parseFloat(budget) : 0,
            deadline: deadline || new Date().toISOString().split('T')[0],
            skills: skillsArray,
            projectDuration: projectDuration || 'short-term',
            budgetType: budgetType || 'fixed',
            status: 'open',
            clientId: client.uid,
            clientName: `${client.firstName} ${client.lastName}`,
            createdAt: new Date().toISOString()
        });
        
        console.log('Job posted successfully to Firebase');
        res.redirect('/client-dashboard?message=Job posted successfully');
    } catch (error) {
        console.error('Error posting job:', error);
        res.render('pages/post-job', {
            user: req.session.user,
            message: 'Error posting job: ' + error.message,
            formData: req.body // Send back the form data to preserve user input
        });
    }
});
// Mark notification as read route
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
});
// Freelancer login page route
app.get('/freelancer-login', (req, res) => {
    res.render('pages/freelancer-login');
});
// Add these routes after the freelancer login routes

// Freelancer registration page route
app.get('/freelancer-register', (req, res) => {
    res.render('pages/freelancer-register');
});

// Freelancer registration route
app.post('/freelancer-register', async (req, res) => {
    try {
        const { name, email, password, skills } = req.body;
        
        // Check if email already exists
        const methods = await fetchSignInMethodsForEmail(auth, email);
        if (methods.length > 0) {
            return res.render('pages/register-freelancer', { 
                error: 'Email already in use. Please use a different email or login.' 
            });
        }
        
        // Create user in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Parse skills from form (assuming they come as comma-separated string)
        const skillsArray = skills.split(',').map(skill => skill.trim());
        
        // Store additional user data in Firestore
        await setDoc(doc(db, 'freelancers', user.uid), {
            name: name,
            email: email,
            userType: 'freelancer',
            skills: skillsArray,
            createdAt: new Date().toISOString()
        });
        
        // Sign out the user after registration (they'll need to login)
        await signOut(auth);
        
        res.redirect('/freelancer-login?message=Registration successful! Please login.');
    } catch (error) {
        console.error('Registration error:', error);
        let errorMessage = 'Registration failed. Please try again.';
        
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Email already in use. Please use a different email.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password is too weak. Please use a stronger password.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email format.';
        }
        
        res.render('pages/register-freelancer', { error: errorMessage });
    }
});

// Client registration route
app.post('/register-client', async (req, res) => {
    try {
        const { firstName, lastName, email, password, company } = req.body;
        
        // Check if email already exists
        const methods = await fetchSignInMethodsForEmail(auth, email);
        if (methods.length > 0) {
            return res.render('pages/register-client', { 
                error: 'Email already in use. Please use a different email or login.' 
            });
        }
        
        // Create user in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Store additional user data in Firestore
        await setDoc(doc(db, 'clients', user.uid), {
            firstName: firstName,
            lastName: lastName,
            email: email,
            company: company || '',
            userType: 'client',
            createdAt: new Date().toISOString()
        });
        
        // Store user data in session
        req.session.user = {
            uid: user.uid,
            email: user.email,
            firstName: firstName,
            lastName: lastName,
            company: company || '',
            userType: 'client'
        };
        
        // Redirect to client dashboard
        res.redirect('/client-dashboard');
        
    } catch (error) {
        console.error('Registration error:', error);
        let errorMessage = 'Registration failed. Please try again.';
        
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Email already in use. Please use a different email.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password is too weak. Please use a stronger password.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email format.';
        }
        
        res.render('pages/register-client', { error: errorMessage });
    }
});

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
            await signOut(auth);
            return res.render('pages/freelancer-login', { 
                error: 'Access denied. Please login with a freelancer account.' 
            });
        }

        const userData = userDoc.data();
        
        // Check if user type is freelancer
        if (userData.userType !== 'freelancer') {
            // Wrong user type
            await signOut(auth);
            return res.render('pages/freelancer-login', { 
                error: 'Access denied. Please login with a freelancer account.' 
            });
        }

        // Store user data in session
        req.session.user = {
            uid: user.uid,
            email: user.email,
            name: userData.name,
            skills: userData.skills || [],
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
        
        res.render('pages/freelancer-login', { error: errorMessage });
    }
}); // Added closing bracket and semicolon for login route

// Search results route
app.get('/results', async (req, res) => {
    try {
        const searchQuery = req.query.skill || '';
        
        if (!searchQuery.trim()) {
            return res.render('pages/results', {
                searchQuery: '',
                freelancers: []
            });
        }
        
        // Query Firestore for freelancers with matching skills
        const freelancersRef = collection(db, 'freelancers');
        const querySnapshot = await getDocs(freelancersRef);
        
        const freelancers = [];
        querySnapshot.forEach(doc => {
            const freelancerData = doc.data();
            
            // Check if the freelancer has the searched skill
            if (freelancerData.skills && 
                Array.isArray(freelancerData.skills) && 
                freelancerData.skills.some(skill => 
                    skill.toLowerCase().includes(searchQuery.toLowerCase())
                )) {
                
                // Use the name field directly instead of trying to combine firstName and lastName
                const name = freelancerData.name || 'Freelancer';
                
                freelancers.push({
                    id: doc.id,
                    name: name,
                    title: freelancerData.title || 'Freelancer',
                    skills: freelancerData.skills || [],
                    hourlyRate: freelancerData.hourlyRate || 'Not specified',
                    bio: freelancerData.bio || 'No bio available'
                });
            }
        });
        
        res.render('pages/results', {
            searchQuery,
            freelancers
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

// Add route to show all freelancers
app.get('/allfreelancers', async (req, res) => {
    try {
        // Query Firestore for all freelancers
        const freelancersRef = collection(db, 'freelancers');
        const querySnapshot = await getDocs(freelancersRef);
        
        const freelancers = [];
        querySnapshot.forEach(doc => {
            const freelancerData = doc.data();
            
            // Use the name field directly
            const name = freelancerData.name || 'Freelancer';
            
            freelancers.push({
                id: doc.id,
                name: name,
                title: freelancerData.title || 'Freelancer',
                skills: freelancerData.skills || [],
                hourlyRate: freelancerData.hourlyRate || 'Not specified',
                bio: freelancerData.bio || 'No bio available'
            });
        });
        
        res.render('pages/results', {
            searchQuery: 'All Skills',
            freelancers
        });
    } catch (error) {
        console.error('Error fetching all freelancers:', error);
        res.render('pages/results', {
            searchQuery: 'All Skills',
            freelancers: [],
            error: 'An error occurred while fetching freelancers. Please try again.'
        });
    }
});

// Message freelancer route
app.get('/message-freelancer/:freelancerId', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login?message=Please login to send messages');
        }

        const freelancerId = req.params.freelancerId;
        const freelancerDoc = await getDoc(doc(db, 'freelancers', freelancerId));

        if (!freelancerDoc.exists()) {
            return res.redirect('/client-dashboard?error=Freelancer not found');
        }

        const freelancerData = freelancerDoc.data();
        res.render('pages/client-messaging', {
            user: req.session.user,
            freelancer: {
                id: freelancerId,
                name: freelancerData.name,
                title: freelancerData.title || 'Freelancer'
            }
        });
    } catch (error) {
        console.error('Error loading messaging page:', error);
        res.redirect('/client-dashboard?error=Error loading messaging page');
    }
});

// Add this route to accept freelancer request without authentication middleware
app.get('/accept-request/:freelancerId/:notificationId', async (req, res) => {
    try {
        // Check if user is logged in
        if (!req.session.user) {
            return res.redirect('/login?message=Please login to accept requests');
        }
        
        // Check if user is a client
        if (req.session.user.userType !== 'client') {
            return res.redirect('/login?message=Only clients can accept requests');
        }
        
        const freelancerId = req.params.freelancerId;
        const notificationId = req.params.notificationId;
        const clientId = req.session.user.uid;
        const clientName = req.session.user.firstName + ' ' + req.session.user.lastName;
        
        // Update notification status to accepted
        if (notificationId && notificationId !== '') {
            const notificationRef = doc(db, 'notifications', notificationId);
            await updateDoc(notificationRef, {
                status: 'accepted',
                read: true,
                updatedAt: new Date().toISOString()
            });
        }
        
        // Create a connection between client and freelancer
        const connectionsRef = collection(db, 'connections');
        await addDoc(connectionsRef, {
            clientId: clientId,
            freelancerId: freelancerId,
            status: 'active',
            createdAt: new Date().toISOString()
        });
        
        // Send notification to freelancer
        const freelancerNotificationsRef = collection(db, 'freelancerNotifications');
        await addDoc(freelancerNotificationsRef, {
            freelancerId: freelancerId,
            clientId: clientId,
            clientName: clientName,
            type: 'request_accepted',
            message: 'Your request was accepted by ' + clientName,
            read: false,
            createdAt: new Date().toISOString()
        });
        
        // Render success page
        res.render('pages/request-accepted', {
            user: req.session.user,
            freelancerId: freelancerId,
            message: 'Request accepted successfully'
        });
    } catch (error) {
        console.error('Error accepting freelancer request:', error);
        res.redirect(`/freelancer-profile/${req.params.freelancerId}?message=Error accepting request`);
    }
});

// Add this new route for freelancer messaging
app.get('/freelancer-messaging/:clientId', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    try {
        // Get client data from Firestore
        const clientRef = doc(db, 'users', req.params.clientId);
        const clientSnap = await getDoc(clientRef);

        if (!clientSnap.exists()) {
            return res.redirect('/freelancer-dashboard?error=Client not found');
        }

        const clientData = clientSnap.data();
        const client = {
            id: clientSnap.id,
            name: clientData.firstName + ' ' + clientData.lastName,
            ...clientData
        };

        res.render('pages/freelancer-messaging', {
            user: req.session.user,
            client: client
        });
    } catch (error) {
        console.error('Error loading messaging page:', error);
        res.redirect('/freelancer-dashboard?error=Error loading chat');
    }
});

// Initialize HTTP server and Socket.IO
const http = require('http');
const server = http.createServer(app);
const io = require('socket.io')(server);

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected to socket');

    // Handle joining chat room
    socket.on('joinRoom', ({ clientId, freelancerId }) => {
        const roomId = `chat_${clientId}_${freelancerId}`;
        socket.join(roomId);
        console.log(`Joined room: ${roomId}`);
    });

    // Handle client messages
    socket.on('clientMessage', async (data) => {
        try {
            const roomId = `chat_${data.clientId}_${data.freelancerId}`;
            
            // Emit message to room
            io.to(roomId).emit('message', {
                message: data.message,
                sender: 'client',
                timestamp: new Date().toISOString()
            });

            // Send notification to freelancer
            io.emit('newNotification', {
                type: 'new_message',
                freelancerId: data.freelancerId,
                senderId: data.clientId,
                senderName: data.clientName,
                message: data.message,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error handling client message:', error);
        }
    });

    // Handle freelancer messages
    socket.on('freelancerMessage', async (data) => {
        try {
            const roomId = `chat_${data.clientId}_${data.freelancerId}`;
            
            io.to(roomId).emit('message', {
                message: data.message,
                sender: 'freelancer',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error handling freelancer message:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected from socket');
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// All Jobs Route
app.get('/all-jobs', async (req, res) => {
    try {
        // Get query parameters for filtering
        const { search, category } = req.query;
        
        // Reference to jobs collection
        const jobsRef = collection(db, 'jobs');
        let jobsQuery = jobsRef;
        
        // Apply category filter if provided
        if (category) {
            jobsQuery = query(jobsRef, where('category', '==', category));
        }
        
        // Get jobs
        const jobsSnapshot = await getDocs(jobsQuery);
        let allJobs = [];
        
        // Process each job
        for (const docSnapshot of jobsSnapshot.docs) {
            const jobData = docSnapshot.data();
            
            // Get client details
            let clientName = 'Unknown Client';
            let clientCompany = '';
            
            if (jobData.clientId) {
                const clientDocRef = doc(db, 'clients', jobData.clientId);
                const clientDoc = await getDoc(clientDocRef);
                if (clientDoc.exists()) {
                    const clientData = clientDoc.data();
                    clientName = clientData.name || 'Unknown Client';
                    clientCompany = clientData.company || '';
                }
            }
            
            // Add job to array with client details
            allJobs.push({
                id: docSnapshot.id,
                ...jobData,
                clientName,
                clientCompany,
                createdAt: jobData.createdAt || new Date().toISOString()
            });
        }
        
        // Apply search filter if provided
        if (search) {
            const searchLower = search.toLowerCase();
            allJobs = allJobs.filter(job => 
                (job.title && job.title.toLowerCase().includes(searchLower)) ||
                (job.description && job.description.toLowerCase().includes(searchLower)) ||
                (job.category && job.category.toLowerCase().includes(searchLower)) ||
                (job.clientName && job.clientName.toLowerCase().includes(searchLower)) ||
                (job.clientCompany && job.clientCompany.toLowerCase().includes(searchLower))
            );
        }
        
        // Sort jobs by creation date (newest first)
        allJobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        // Render the all-jobs page
        res.render('pages/all-jobs', {
            user: req.session.user,
            jobs: allJobs
        });
    } catch (error) {
        console.error('Error fetching jobs:', error);
        // Check if the error template exists, if not redirect to home
        try {
            res.status(500).render('pages/error', { 
                error: 'Failed to load jobs. Please try again later.' 
            });
        } catch (renderError) {
            // If error template doesn't exist, redirect to home with error message
            res.redirect('/?error=Failed to load jobs. Please try again later.');
        }
    }
});