/**
 * notifications-api.js
 * Handles Email and SMS notifications (Mock Implementation)
 * Ready for SendGrid/Twilio integration
 */
import { supabase } from '../core/supabase-client.js';

// Configuration
const MOCK_MODE = true;

/**
 * Send Email Notification
 * @param {string} toEmail 
 * @param {string} subject 
 * @param {string} htmlContent 
 */
export async function sendEmail(toEmail, subject, htmlContent) {
  if (MOCK_MODE) {
    console.log(`%c[EMAIL MOCK] To: ${toEmail} | Subject: ${subject}`, 'color: #0d9488; font-weight: bold;');
    // console.log(htmlContent); // Optional: log body
    return { success: true };
  }
  
  // Real implementation: Call Supabase Function or external API
  // const { error } = await supabase.functions.invoke('send-email', { toEmail, subject, htmlContent });
  return { success: true };
}

/**
 * Send SMS Notification
 * @param {string} toPhone 
 * @param {string} message 
 */
export async function sendSMS(toPhone, message) {
  if (MOCK_MODE) {
    console.log(`%c[SMS MOCK] To: ${toPhone} | Msg: ${message}`, 'color: #eab308; font-weight: bold;');
    return { success: true };
  }
  
  // Real implementation
  // const { error } = await supabase.functions.invoke('send-sms', { toPhone, message });
  return { success: true };
}

/**
 * Trigger: Welcome Email
 */
export async function notifyWelcome(user) {
  const subject = 'Welcome to AussieTradieHub! ??';
  const html = `
    <h1>G'day ${user.user_metadata.display_name || 'Mate'}!</h1>
    <p>Thanks for joining AussieTradieHub. We're stoked to have you.</p>
    <p>Get started by completing your profile or posting a job.</p>
  `;
  await sendEmail(user.email, subject, html);
}

/**
 * Trigger: New Message Alert
 */
export async function notifyNewMessage(toUserId, fromUserName, messageSnippet) {
  // 1. Get user email/phone
  const { data: user } = await supabase.from('users').select('email, phone, display_name').eq('id', toUserId).single();
  if (!user) return;

  // Email
  await sendEmail(
    user.email, 
    `New message from ${fromUserName}`, 
    `<p>${fromUserName} says: "${messageSnippet}..."</p><p><a href="#">Reply now</a></p>`
  );
  
  // SMS (if urgent/enabled settings)
  // await sendSMS(user.phone, `TradieHub: New msg from ${fromUserName}.`);
}

/**
 * Trigger: Job Application Received
 */
export async function notifyApplicationReceived(customerUserId, tradieName, jobTitle) {
   const { data: user } = await supabase.from('users').select('email').eq('id', customerUserId).single();
   if (!user) return;
   
   await sendEmail(
     user.email,
     `New Quote: ${jobTitle}`,
     `<p>${tradieName} has sent you a quote for "${jobTitle}". Log in to view details.</p>`
   );
}
