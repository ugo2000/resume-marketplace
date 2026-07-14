(() => {
  const status = document.getElementById('auth-callback-status');
  const showError = () => {
    if (status) {
      status.textContent =
        'This verification link is invalid or expired. Return to sign in and request a new email.';
    }
  };

  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = fragment.get('access_token');
  const refreshToken = fragment.get('refresh_token');
  const authError = fragment.get('error');

  window.history.replaceState(null, '', window.location.pathname + window.location.search);

  if (authError || !accessToken || !refreshToken) {
    showError();
    return;
  }

  fetch('/auth/callback/session', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ accessToken, refreshToken }),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error('verification_failed');
      return response.json();
    })
    .then((result) => {
      window.location.replace(result.next || '/');
    })
    .catch(showError);
})();
