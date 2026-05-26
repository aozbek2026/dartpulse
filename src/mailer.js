// E-posta gönderici — Resend API
// FROM: noreply@dartcorepro.com (domain doğrulandıktan sonra)
// Şimdilik: onboarding@resend.dev (test)

// 'resend' paketi opsiyonel: yerel geliştirmede yüklü olmayabilir.
// Paket yoksa veya API key yoksa sendMail no-op olur, server kalkar.
let Resend = null;
try {
  ({ Resend } = require('resend'));
} catch (e) {
  console.warn('[Mailer] "resend" paketi yüklü değil — e-posta göndermek için: npm install resend');
}

const resend = (Resend && process.env.RESEND_API_KEY)
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = process.env.EMAIL_FROM || 'Dart Core Pro <onboarding@resend.dev>';
const BASE_URL = process.env.BASE_URL || 'https://www.dartcorepro.com';

async function sendMail({ to, subject, html }) {
  if (!resend) {
    console.warn('[Mailer] RESEND_API_KEY yok — e-posta gönderilmedi:', subject, to);
    return;
  }
  try {
    const { error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) console.error('[Mailer] Gönderim hatası:', error);
  } catch (err) {
    console.error('[Mailer] Exception:', err.message);
  }
}

function verifyEmailHtml(token) {
  const url = `${BASE_URL}/verify-email.html?token=${token}`;
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem;">
      <h2 style="color:#ff3860;">🎯 Dart Core Pro</h2>
      <p>Hesabınızı doğrulamak için aşağıdaki butona tıklayın.</p>
      <p style="margin:2rem 0;">
        <a href="${url}" style="background:#ff3860;color:#fff;padding:0.75rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:700;">
          E-postamı Doğrula
        </a>
      </p>
      <p style="color:#888;font-size:0.85rem;">Bu link 24 saat geçerlidir. Eğer kaydolmadıysanız bu e-postayı görmezden gelebilirsiniz.</p>
    </div>`;
}

function resetPasswordHtml(token) {
  const url = `${BASE_URL}/reset-password.html?token=${token}`;
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem;">
      <h2 style="color:#ff3860;">🎯 Dart Core Pro</h2>
      <p>Şifre sıfırlama talebinde bulundunuz. Aşağıdaki butona tıklayın.</p>
      <p style="margin:2rem 0;">
        <a href="${url}" style="background:#ff3860;color:#fff;padding:0.75rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:700;">
          Şifremi Sıfırla
        </a>
      </p>
      <p style="color:#888;font-size:0.85rem;">Bu link 1 saat geçerlidir. Talebi siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.</p>
    </div>`;
}

async function sendVerifyEmail(to, token) {
  await sendMail({
    to,
    subject: 'Dart Core Pro — E-posta Doğrulama',
    html: verifyEmailHtml(token),
  });
}

async function sendResetEmail(to, token) {
  await sendMail({
    to,
    subject: 'Dart Core Pro — Şifre Sıfırlama',
    html: resetPasswordHtml(token),
  });
}

module.exports = { sendVerifyEmail, sendResetEmail };
