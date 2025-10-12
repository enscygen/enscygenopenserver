// Import Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, updateProfile, sendPasswordResetEmail, signInWithCustomToken, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, getDoc, updateDoc, arrayUnion, addDoc, orderBy, serverTimestamp, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase Initialization ---

const firebaseConfig = {
    apiKey: "AIzaSyDwOb4_vljD6q6-__ZWuzJF-vS3_5zmCqc",
    authDomain: "enscygen.firebaseapp.com",
    projectId: "enscygen",
    storageBucket: "enscygen.firebasestorage.app",
    messagingSenderId: "513868996763",
    appId: "1:513868996763:web:eb14657be98255570b663e",
    measurementId: "G-XL8Z4LDQB5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Global State ---
let currentUser = null;
let currentUserData = null;
let currentTicketDocId = null;

// --- DOM Element Cache ---
const portalLayout = document.querySelector('.portal-layout');

// Sections
const authSection = document.getElementById('auth-section');
const profileSection = document.getElementById('profile-section');
const contactUsSection = document.getElementById('contact-us-section');
const myTicketsSection = document.getElementById('my-tickets-section');
const ticketDetailSection = document.getElementById('ticket-detail-section');

// Navigation Links
const navLinks = {
    profile: document.getElementById('nav-profile-link'),
    'contact-us': document.getElementById('nav-contact-us-link'),
    'my-tickets': document.getElementById('nav-my-tickets-link'),
    logout: document.getElementById('nav-logout-link')
};

// Auth Elements
const loginFormContainer = document.getElementById('login-form-container');
const registerFormContainer = document.getElementById('register-form-container');
const forgotPasswordArea = document.getElementById('forgot-password-area');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authStatusMessage = document.getElementById('auth-status');
const googleLoginBtn = document.getElementById('google-login-btn');
const showRegisterFormLink = document.getElementById('show-register-form');
const showLoginFormLink = document.getElementById('show-login-form');
const showForgotPasswordLink = document.getElementById('show-forgot-password');
const sendResetEmailBtn = document.getElementById('send-reset-email-btn');
const cancelForgotPasswordBtn = document.getElementById('cancel-forgot-password-btn');

// Profile Elements
const profileForm = document.getElementById('profile-form');
const profileEmailDisplay = document.getElementById('profile-email-display');
const profileNameInput = document.getElementById('profile-name');
const profileInstitutionInput = document.getElementById('profile-institution');
const profilePlaceInput = document.getElementById('profile-place');
const profileGenderSelect = document.getElementById('profile-gender');
const profileUpdateMessage = document.getElementById('profile-update-message');
const deleteAccountBtn = document.getElementById('delete-account-btn');
const deleteConfirmationArea = document.getElementById('delete-confirmation-area');
const deleteConfirmInput = document.getElementById('delete-confirm-input');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
const deleteAccountMessage = document.getElementById('delete-account-message');
const headerUserEmail = document.getElementById('header-user-email');

// Ticket Submission Elements
const contactForm = document.getElementById('contact-form');
const contactNameInput = document.getElementById('contact-name');
const contactEmailInput = document.getElementById('contact-email');
const subjectInput = document.getElementById('subject');
const enquiryTextarea = document.getElementById('enquiry');
const submitTicketBtn = document.getElementById('submit-ticket-btn');
const ticketSubmitMessage = document.getElementById('ticket-submit-message');

// My Tickets Elements
const ticketsList = document.getElementById('tickets-list');

// Ticket Detail Elements
const detailTicketSubject = document.getElementById('detail-ticket-subject');
const detailTicketId = document.getElementById('detail-ticket-id');
const detailTicketStatus = document.getElementById('detail-ticket-status');
const detailTicketCreatedAt = document.getElementById('detail-ticket-created-at');
const detailTicketEnquiry = document.getElementById('detail-ticket-enquiry');
const ticketConversation = document.getElementById('ticket-conversation');
const replyForm = document.getElementById('reply-form');
const replyMessageInput = document.getElementById('reply-message');
const submitReplyBtn = document.getElementById('submit-reply-btn');
const ticketReplyMessage = document.getElementById('ticket-reply-message');

// --- Helper Functions ---
function showPageSection(sectionElement) {
    document.querySelectorAll('.page-section').forEach(section => section.classList.remove('active'));
    if (sectionElement) sectionElement.classList.add('active');
}

function showMessage(element, message, type = 'success') {
    if (!element) return;
    element.textContent = message;
    element.className = `message-box ${type}-message`;
    element.style.display = 'block';
}

function clearMessage(element) {
    if (!element) return;
    element.textContent = '';
    element.style.display = 'none';
}

function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    const date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date();
    return date.toLocaleString();
}

// --- UI & Navigation ---
function updateActiveNavLink(currentRoute) {
    Object.values(navLinks).forEach(link => link.classList.remove('active'));
    // Handle ticket detail route to highlight 'my-tickets'
    const navKey = currentRoute.startsWith('ticket-detail') ? 'my-tickets' :
        currentRoute === 'access-granted' ? 'access-granted' : currentRoute;

    if (navLinks[navKey]) {
        navLinks[navKey].classList.add('active');
    }
}

// --- Client-Side Router ---
async function router() {
    const path = window.location.hash.substring(1) || (currentUser ? 'profile' : 'auth');
    const [route, param] = path.split('/');

    let targetSection = null;
    updateActiveNavLink(route);

    switch (route) {
        case 'auth':
            if (currentUser) {
                // If the user is logged in, don't show the auth page, redirect to tickets.
                return window.location.hash = 'my-tickets';
            }
            targetSection = authSection;
            loginFormContainer.style.display = 'block';
            registerFormContainer.style.display = 'none';
            forgotPasswordArea.style.display = 'none';
            break;

        case 'profile':
            if (!currentUser) return window.location.hash = 'auth';
            targetSection = profileSection;
            populateProfileForm();
            break;

        case 'contact-us':
            if (!currentUser) return window.location.hash = 'auth';
            targetSection = contactUsSection;
            populateContactForm();
            break;

        case 'my-tickets':
            if (!currentUser) return window.location.hash = 'auth';
            targetSection = myTicketsSection;
            loadUserTickets();
            break;

        case 'ticket-detail':
            if (!currentUser) return window.location.hash = 'auth';
            if (!param) return window.location.hash = 'my-tickets';
            targetSection = ticketDetailSection;
            await viewUserTicketDetails(param);
            break;

        case 'access-granted':
            if (!currentUser) return window.location.hash = 'auth';
            targetSection = document.getElementById('access-granted-section');
            loadAccessList();
            break;


        default:
            window.location.hash = currentUser ? 'profile' : 'auth';
            break;
    }
    showPageSection(targetSection);
}
const urlParams = new URLSearchParams(window.location.search);
const returnUrl = urlParams.get('return');
// --- Authentication State Observer ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        try {
            const userDocRef = doc(db, 'users', user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                currentUserData = userDocSnap.data();
            } else {
                // Create a profile if it's missing (e.g., first Google sign-in)
                currentUserData = {
                    name: user.displayName || user.email.split('@')[0],
                    email: user.email,
                    institution: '', place: '', gender: 'Prefer not to say'
                };
                await setDoc(userDocRef, { ...currentUserData, createdAt: serverTimestamp() });
            }
            updateUIForLoggedInUser();


            if (returnUrl) {
                console.log(`Redirecting back to ${returnUrl}...`);
                window.location.href = returnUrl;
            } else {
                console.log("No return URL, stay on account page.");
            }



        } catch (error) {
            console.error("Error fetching user data:", error);
            // Log out if we can't get user data
            await signOut(auth);
        }
    } else {
        currentUser = null;
        currentUserData = null;
        updateUIForLoggedOutUser();
    }
    // Run router after auth state is fully resolved
    router();
});

function updateUIForLoggedInUser() {
    authSection.classList.remove('active');
    portalLayout.style.display = 'flex';
    headerUserEmail.textContent = currentUser.email;
}

function updateUIForLoggedOutUser() {
    portalLayout.style.display = 'none';
    authSection.classList.add('active'); // Ensure auth is visible
    window.location.hash = 'auth';
}

async function loadAccessList() {
    const accessListEl = document.getElementById('access-list');
    accessListEl.innerHTML = '<li>Loading...</li>';

    try {
        const accessDocRef = doc(db, "user_access", currentUser.email);
        const accessDocSnap = await getDoc(accessDocRef);
        if (!accessDocSnap.exists()) {
            accessListEl.innerHTML = '<li>No access information found.</li>';
            return;
        }

        const pageIds = accessDocSnap.data().pages || [];
        if (!pageIds.length) {
            accessListEl.innerHTML = '<li>You currently have no page access.</li>';
            return;
        }

        // Fetch page metadata for display
        const pagePromises = pageIds.map(async (id) => {
            const pageDoc = await getDoc(doc(db, "pages", id));
            return {
                id,
                name: pageDoc.exists() ? pageDoc.data().name : "(No Name)"
            };
        });

        const pages = await Promise.all(pagePromises);

        accessListEl.innerHTML = '';
        pages.forEach(p => {
            const li = document.createElement('li');
            li.classList.add('access-item'); // for styling

            // Page ID on top
            const idDiv = document.createElement('div');
            idDiv.textContent = `ID: ${p.id}`;
            idDiv.classList.add('access-id');

            // Page name below
            const nameDiv = document.createElement('div');
            nameDiv.textContent = p.name;
            nameDiv.classList.add('access-name');

            li.appendChild(idDiv);
            li.appendChild(nameDiv);
            accessListEl.appendChild(li);
        });


    } catch (error) {
        console.error("Error fetching access list:", error);
        accessListEl.innerHTML = '<li>Error loading access list.</li>';
    }
}



// --- Auth Form Logic ---
showRegisterFormLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginFormContainer.style.display = 'none';
    registerFormContainer.style.display = 'block';
});
showLoginFormLink.addEventListener('click', (e) => {
    e.preventDefault();
    registerFormContainer.style.display = 'none';
    loginFormContainer.style.display = 'block';
});
showForgotPasswordLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginFormContainer.style.display = 'none';
    forgotPasswordArea.style.display = 'block';
});
cancelForgotPasswordBtn.addEventListener('click', (e) => {
    e.preventDefault();
    forgotPasswordArea.style.display = 'none';
    loginFormContainer.style.display = 'block';
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage(authStatusMessage);
    const email = loginForm['login-email'].value;
    const password = loginForm['login-password'].value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        showMessage(authStatusMessage, 'Invalid email or password.', 'error');
    }
});

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage(authStatusMessage);
    const name = registerForm['register-name'].value;
    const email = registerForm['register-email'].value;
    const password = registerForm['register-password'].value;
    if (password !== registerForm['register-confirm-password'].value) {
        return showMessage(authStatusMessage, 'Passwords do not match.', 'error');
    }
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: name });
        await setDoc(doc(db, 'users', userCredential.user.uid), {
            name, email,
            institution: registerForm['register-institution'].value,
            place: registerForm['register-place'].value,
            gender: registerForm['register-gender'].value,
            createdAt: serverTimestamp()
        });
    } catch (error) {
        showMessage(authStatusMessage, error.message, 'error');
    }
});

sendResetEmailBtn.addEventListener('click', async () => {
    clearMessage(authStatusMessage);
    const email = document.getElementById('forgot-email').value;
    if (!email) return showMessage(authStatusMessage, 'Please enter your email.', 'error');
    try {
        await sendPasswordResetEmail(auth, email);
        showMessage(authStatusMessage, 'Password reset link sent to your email.', 'success');
    } catch (error) {
        showMessage(authStatusMessage, error.message, 'error');
    }
});

googleLoginBtn.addEventListener('click', async () => {
    try {
        await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
        showMessage(authStatusMessage, 'Google sign-in failed. Please try again.', 'error');
    }
});

navLinks.logout.addEventListener('click', async (e) => {
    e.preventDefault();
    await signOut(auth);
});

// --- Profile Management ---
function populateProfileForm() {
    if (!currentUserData) return;
    profileEmailDisplay.textContent = currentUserData.email;
    profileNameInput.value = currentUserData.name || '';
    profileInstitutionInput.value = currentUserData.institution || '';
    profilePlaceInput.value = currentUserData.place || '';
    profileGenderSelect.value = currentUserData.gender || '';
}

profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const updatedData = {
        name: profileNameInput.value,
        institution: profileInstitutionInput.value,
        place: profilePlaceInput.value,
        gender: profileGenderSelect.value,
        lastUpdated: serverTimestamp()
    };
    try {
        await updateDoc(doc(db, 'users', currentUser.uid), updatedData);
        await updateProfile(currentUser, { displayName: updatedData.name });
        showMessage(profileUpdateMessage, 'Profile updated successfully!', 'success');
    } catch (error) {
        showMessage(profileUpdateMessage, 'Failed to update profile.', 'error');
    }
});

// Delete Account
deleteAccountBtn.addEventListener('click', () => deleteConfirmationArea.style.display = 'block');
cancelDeleteBtn.addEventListener('click', () => deleteConfirmationArea.style.display = 'none');
confirmDeleteBtn.addEventListener('click', async () => {
    if (deleteConfirmInput.value !== 'DELETE') {
        return showMessage(deleteAccountMessage, 'Confirmation text does not match.', 'error');
    }
    // This is a complex operation and requires careful implementation
    // of deleting user data from all collections, which is beyond this scope.
    // For now, we will just delete the user auth record.
    try {
        // You would first delete all user's data from Firestore here
        await currentUser.delete();
        showMessage(deleteAccountMessage, 'Account deleted successfully.', 'success');
    } catch (error) {
        showMessage(deleteAccountMessage, 'Failed to delete account. You may need to sign in again for security reasons.', 'error');
    }
});


// --- Ticket Management ---
function populateContactForm() {
    if (!currentUserData) return;
    contactNameInput.value = currentUserData.name || '';
    contactEmailInput.value = currentUserData.email || '';
}

contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ticketData = {
        userId: currentUser.uid,
        userName: contactNameInput.value,
        userEmail: contactEmailInput.value,
        subject: subjectInput.value,
        enquiry: enquiryTextarea.value,
        status: 'Open',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        messages: [{
            type: 'user', senderName: contactNameInput.value,
            message: enquiryTextarea.value, timestamp: serverTimestamp()
        }]
    };
    try {
        await addDoc(collection(db, 'tickets'), ticketData);
        showMessage(ticketSubmitMessage, 'Ticket submitted successfully!', 'success');
        contactForm.reset();
        populateContactForm();
    } catch (error) {
        showMessage(ticketSubmitMessage, 'Failed to submit ticket.', 'error');
    }
});

async function loadUserTickets() {
    ticketsList.innerHTML = '<p>Loading tickets...</p>';
    try {
        const q = query(collection(db, "tickets"), where("userId", "==", currentUser.uid), orderBy("updatedAt", "desc"));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            ticketsList.innerHTML = '<p>You have no tickets.</p>';
            return;
        }
        ticketsList.innerHTML = '';
        querySnapshot.forEach(docSnap => {
            const ticket = docSnap.data();
            const item = document.createElement('div');
            item.className = 'ticket-item';
            item.innerHTML = `
                <div class="ticket-info">
                    <h6>${ticket.subject}</h6>
                    <p>ID: ${docSnap.id.substring(0, 8).toUpperCase()} | Last Update: ${formatDate(ticket.updatedAt)}</p>
                </div>
                <span class="ticket-status ${ticket.status.toLowerCase()}">${ticket.status}</span>
            `;
            item.onclick = () => window.location.hash = `ticket-detail/${docSnap.id}`;
            ticketsList.appendChild(item);
        });
    } catch (error) {
        console.error("Error loading tickets: ", error);
        ticketsList.innerHTML = '<p class="error-message">Could not load tickets.</p>';
    }
}

async function viewUserTicketDetails(docId) {
    currentTicketDocId = docId;
    try {
        const ticketRef = doc(db, 'tickets', docId);
        const ticketSnap = await getDoc(ticketRef);
        if (!ticketSnap.exists() || ticketSnap.data().userId !== currentUser.uid) {
            return window.location.hash = 'my-tickets';
        }
        const ticket = ticketSnap.data();
        detailTicketSubject.textContent = ticket.subject;
        detailTicketId.textContent = docId.substring(0, 8).toUpperCase();
        detailTicketStatus.textContent = ticket.status;
        detailTicketCreatedAt.textContent = formatDate(ticket.createdAt);
        detailTicketEnquiry.textContent = ticket.enquiry;

        ticketConversation.innerHTML = '';
        ticket.messages?.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis()).forEach(msg => {
            const msgItem = document.createElement('div');
            msgItem.className = `message-item ${msg.type}`;
            msgItem.innerHTML = `<strong>${msg.senderName} (${formatDate(msg.timestamp)})</strong><p>${msg.message}</p>`;
            ticketConversation.appendChild(msgItem);
        });
        ticketConversation.scrollTop = ticketConversation.scrollHeight;
    } catch (error) {
        window.location.hash = 'my-tickets';
    }
}

replyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage(ticketReplyMessage);
    const message = replyMessageInput.value.trim();
    if (!message) return;
    const reply = {
        type: 'user',
        senderName: currentUserData.name,
        message: message,
        timestamp: serverTimestamp()
    };
    try {
        const ticketRef = doc(db, 'tickets', currentTicketDocId);
        await updateDoc(ticketRef, {
            messages: arrayUnion(reply),
            status: 'Open',
            updatedAt: serverTimestamp()
        });
        replyMessageInput.value = '';
        viewUserTicketDetails(currentTicketDocId);
    } catch (error) {
        showMessage(ticketReplyMessage, 'Failed to send reply.', 'error');
    }
});


// --- Initial Load ---
window.addEventListener('hashchange', router);
// Initial authentication check using the provided token
(async () => {
    try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        }
    } catch (error) {
        console.error("Auth token sign-in failed:", error);
    }
})();

