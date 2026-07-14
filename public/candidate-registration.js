(() => {
  const start = () => {
    const form = document.querySelector('[data-candidate-registration]');
    if (!(form instanceof HTMLFormElement)) return;

    const steps = Array.from(form.querySelectorAll('[data-registration-step]'));
    const progressItems = Array.from(document.querySelectorAll('[data-progress-step]'));
    const status = form.querySelector('[data-registration-status]');
    const password = form.elements.namedItem('password');
    const confirmPassword = form.elements.namedItem('confirmPassword');
    const finalButton = form.querySelector('[data-final-submit]');
    let currentStep = 1;

    const stepName = (stepNumber) => (
      stepNumber === 1 ? 'Account' : stepNumber === 2 ? 'Job profile' : 'Review'
    );

    const updatePasswordValidity = () => {
      if (!(password instanceof HTMLInputElement)) return;
      if (!(confirmPassword instanceof HTMLInputElement)) return;
      confirmPassword.setCustomValidity(
        confirmPassword.value && confirmPassword.value !== password.value
          ? 'Passwords must match.'
          : '',
      );
    };

    const fieldValue = (name) => {
      const control = form.elements.namedItem(name);
      if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) {
        return control.value.trim();
      }
      return '';
    };

    const setReviewText = (name, value) => {
      const target = form.querySelector(`[data-review-field="${name}"]`);
      if (target) target.textContent = value || '—';
    };

    const updateReview = () => {
      const countries = { US: 'United States', CA: 'Canada' };
      const authorization = {
        authorized_without_sponsorship: 'Authorized without sponsorship',
        future_sponsorship_may_be_required: 'May require sponsorship in the future',
        sponsorship_required: 'Requires sponsorship',
      };
      const country = fieldValue('country');
      const location = [fieldValue('city'), fieldValue('stateProvince'), countries[country]]
        .filter(Boolean)
        .join(', ');
      const years = fieldValue('yearsExperience');

      setReviewText('email', fieldValue('email'));
      setReviewText('fullName', fieldValue('fullName'));
      setReviewText('location', location);
      setReviewText('headline', fieldValue('headline'));
      setReviewText('yearsExperience', years ? `${years} year${years === '1' ? '' : 's'}` : '—');
      setReviewText('workAuthorization', authorization[fieldValue('workAuthorization')] || '—');
    };

    const showStep = (stepNumber, moveFocus = true) => {
      currentStep = stepNumber;
      steps.forEach((step) => {
        const active = Number(step.getAttribute('data-registration-step')) === stepNumber;
        step.hidden = !active;
      });
      progressItems.forEach((item) => {
        const active = Number(item.getAttribute('data-progress-step')) === stepNumber;
        if (active) item.setAttribute('aria-current', 'step');
        else item.removeAttribute('aria-current');
        item.classList.toggle(
          'is-complete',
          Number(item.getAttribute('data-progress-step')) < stepNumber,
        );
      });
      if (status) status.textContent = `Step ${stepNumber} of 3: ${stepName(stepNumber)}`;
      if (stepNumber === 3) updateReview();
      if (moveFocus) {
        const legend = steps[stepNumber - 1]?.querySelector('legend');
        if (legend instanceof HTMLElement) legend.focus();
      }
    };

    const validateStep = (stepNumber) => {
      if (stepNumber === 1) updatePasswordValidity();
      const step = steps.find(
        (item) => Number(item.getAttribute('data-registration-step')) === stepNumber,
      );
      if (!(step instanceof HTMLFieldSetElement)) return false;

      const controls = Array.from(step.querySelectorAll('input, select, textarea'));
      for (const control of controls) {
        if (
          control instanceof HTMLInputElement
          || control instanceof HTMLSelectElement
          || control instanceof HTMLTextAreaElement
        ) {
          if (!control.checkValidity()) {
            control.reportValidity();
            control.focus();
            if (status) status.textContent = `Please correct the highlighted field in Step ${stepNumber}.`;
            return false;
          }
        }
      }
      return true;
    };

    form.classList.add('registration-enhanced');
    showStep(1, false);

    form.querySelectorAll('[data-next-step]').forEach((button) => {
      button.addEventListener('click', () => {
        const target = Number(button.getAttribute('data-next-step'));
        if (validateStep(currentStep)) showStep(target);
      });
    });

    form.querySelectorAll('[data-back-step]').forEach((button) => {
      button.addEventListener('click', () => {
        showStep(Number(button.getAttribute('data-back-step')));
      });
    });

    password?.addEventListener('input', updatePasswordValidity);
    confirmPassword?.addEventListener('input', updatePasswordValidity);

    form.addEventListener('submit', (event) => {
      for (let stepNumber = 1; stepNumber <= 3; stepNumber += 1) {
        showStep(stepNumber, false);
        if (!validateStep(stepNumber)) {
          event.preventDefault();
          return;
        }
      }

      showStep(3, false);
      form.setAttribute('aria-busy', 'true');
      if (finalButton instanceof HTMLButtonElement) finalButton.disabled = true;
      if (status) status.textContent = 'Creating your candidate account…';
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
