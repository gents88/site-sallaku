document.getElementById('contactForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const statusEl = document.getElementById('status');
  const btn = this.querySelector('button[type="submit"]');
  btn.disabled = true;
  statusEl.textContent = 'Invio in corso...';

  const payload = {
    name: document.getElementById('name').value.trim(),
    email: document.getElementById('email').value.trim(),
    message: document.getElementById('message').value.trim(),
    hp: document.getElementById('hp') ? document.getElementById('hp').value.trim() : ''
  };

  try {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (res.ok && data.ok) {
      statusEl.textContent = 'Messaggio inviato con successo. Grazie!';
      this.reset();
    } else {
      statusEl.textContent = 'Errore: ' + (data.error || 'Invio non riuscito');
    }
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Errore di rete. Riprova più tardi.';
  } finally {
    btn.disabled = false;
    setTimeout(() => { statusEl.textContent = ''; }, 7000);
  }
});
