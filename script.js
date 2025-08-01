// Initialiser Firebase
const firebaseConfig = {
    apiKey: "AIzaSyC2NZv-ByuJGMeWrDfmUMCOs1ydR41GDpw",
    authDomain: "authentification-21246.firebaseapp.com",
    projectId: "authentification-21246",
    storageBucket: "authentification-21246.firebasestorage.app",
    messagingSenderId: "1075313779103",
    appId: "1:1075313779103:web:7459ab80d5a55e61ff9daa",
    measurementId: "G-8CNZQP1FG0"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Afficher les publications
async function displayPosts() {
    const postsContainer = document.getElementById('posts');
    postsContainer.innerHTML = '';

    // Récupérer les publications depuis Firestore (triées par date)
    const querySnapshot = await db.collection('posts').orderBy('timestamp', 'desc').get();
    const posts = [];
    querySnapshot.forEach(doc => posts.push({ id: doc.id, ...doc.data() }));

    posts.forEach(post => {
        const postDiv = document.createElement('div');
        postDiv.className = 'post';
        postDiv.innerHTML = `
            <h2 class="text-xl font-semibold text-gray-800">${post.title}</h2>
            <p class="text-gray-600 mb-2">Publié par ${post.author} le ${new Date(post.timestamp).toLocaleString('fr-FR')}</p>
            <p class="text-gray-600 mb-4">${post.content}</p>
            ${post.image ? `<img src="${post.image}" alt="${post.title}">` : ''}
            <div class="comments mt-4">
                <h3 class="text-lg font-medium text-gray-700">Commentaires</h3>
                ${post.comments
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .map(comment => `<div class="comment">${comment.text} <small>(${new Date(comment.timestamp).toLocaleString('fr-FR')})</small></div>`)
                    .join('')}
                <form class="comment-form mt-2" data-post-id="${post.id}">
                    <input type="text" name="comment" placeholder="Ajouter un commentaire" required class="w-full p-2 border rounded">
                    <button type="submit" class="bg-blue-500 text-white p-2 rounded hover:bg-blue-600 mt-2">Commenter</button>
                </form>
            </div>
        `;
        postsContainer.appendChild(postDiv);
    });

    // Ajouter les écouteurs pour les commentaires
    document.querySelectorAll('.comment-form').forEach(form => {
        form.addEventListener('submit', handleCommentSubmit);
    });
}

// Gérer l'authentification
const authForm = document.getElementById('auth-form');
const codeForm = document.getElementById('code-form');
const authMessage = document.getElementById('auth-message');
let verificationId = null;

authForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const name = document.getElementById('name').value.trim();
    const phone = document.getElementById('phone').value.trim();

    // Initialiser reCAPTCHA
    window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
        size: 'invisible'
    });

    try {
        const confirmationResult = await auth.signInWithPhoneNumber(phone, window.recaptchaVerifier);
        verificationId = confirmationResult.verificationId;
        authMessage.textContent = 'Code SMS envoyé ! Entrez le code reçu.';
        authForm.classList.add('hidden');
        codeForm.classList.remove('hidden');
        localStorage.setItem('tempName', name);
    } catch (error) {
        authMessage.textContent = `Erreur : ${error.message}`;
    }
});

codeForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const code = document.getElementById('code').value.trim();
    const name = localStorage.getItem('tempName');

    try {
        const credential = firebase.auth.PhoneAuthProvider.credential(verificationId, code);
        await auth.signInWithCredential(credential);
        const user = auth.currentUser;
        await user.updateProfile({ displayName: name });
        authMessage.textContent = `Bienvenue, ${name} !`;
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('post-section').classList.remove('hidden');
        displayPosts();
    } catch (error) {
        authMessage.textContent = `Erreur : ${error.message}`;
    }
});

// Vérifier l'état de l'authentification
auth.onAuthStateChanged(user => {
    if (user) {
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('post-section').classList.remove('hidden');
        displayPosts();
    }
});

// Gérer la soumission des commentaires
async function handleCommentSubmit(e) {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) {
        alert('Veuillez vous connecter pour commenter.');
        return;
    }

    const postId = e.target.dataset.postId;
    const commentInput = e.target.querySelector('input[name="comment"]');
    const comment = commentInput.value.trim();

    if (comment) {
        const postRef = db.collection('posts').doc(postId);
        await postRef.update({
            comments: firebase.firestore.FieldValue.arrayUnion({
                text: `${user.displayName}: ${comment}`,
                timestamp: Date.now()
            })
        });
        commentInput.value = '';
        displayPosts();

        // Envoyer à Web3Forms
        const formData = new FormData();
        formData.append('access_key', '9eae8f19-3986-457e-991f-43c241c17b22');
        formData.append('subject', 'Nouveau commentaire');
        formData.append('post_id', postId);
        formData.append('comment', comment);
        formData.append('author', user.displayName);

        fetch('https://api.web3forms.com/submit', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => console.log('Commentaire envoyé:', data))
        .catch(error => console.error('Erreur:', error));
    }
}

// Gérer la soumission du formulaire de publication
document.getElementById('post-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) {
        alert('Veuillez vous connecter pour publier.');
        return;
    }

    const formData = new FormData(this);
    const title = formData.get('title');
    const content = formData.get('content');
    const imageUrl = formData.get('image_url');
    const imageFile = formData.get('image');

    let image = imageUrl;
    if (imageFile.size > 0) {
        const storageRef = storage.ref(`images/${Date.now()}_${imageFile.name}`);
        await storageRef.put(imageFile);
        image = await storageRef.getDownloadURL();
    }

    // Ajouter la publication à Firestore
    await db.collection('posts').add({
        title,
        content,
        image,
        comments: [],
        timestamp: Date.now(),
        author: user.displayName
    });
    displayPosts();
    this.reset();

    // Envoyer à Web3Forms
    formData.append('subject', 'Nouvelle publication');
    formData.append('author', user.displayName);
    fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => console.log('Publication envoyée:', data))
    .catch(error => console.error('Erreur:', error));
});