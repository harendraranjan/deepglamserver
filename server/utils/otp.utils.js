// ✅ Mock OTP sender – replace with SMS provider (Twilio, Msg91, Fast2SMS, etc.)
exports.sendOtp = async (phone, otp) => {
  console.log(`📲 [Mock SMS] Sending OTP ${otp} to phone: ${phone}`);
  // 🔐 For real app: integrate Twilio or any SMS provider here.
  // You can use axios or fetch to send requests to SMS APIs.
};
