import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Setup transporter once (singleton style)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.USER,
    pass: process.env.PASSWORD, // Use an App Password if using Gmail + 2FA
  },
});

/**
 * Convert slot date from `DD_MM_YYYY` → `YYYYMMDD`
 */
const formatDateForCalendar = (dateStr) => {
  const [day, month, year] = dateStr.split("_");
  return `${year}${month}${day}`;
};

/**
 * Convert slot time from `hh:mm AM/PM` → { start: "HHMM00", end: "HHMM00" }
 */
const formatTimeForCalendar = (timeStr) => {
  let [time, modifier] = timeStr.split(" ");
  let [hours, minutes] = time.split(":").map(Number);

  if (modifier?.toUpperCase() === "PM" && hours !== 12) hours += 12;
  if (modifier?.toUpperCase() === "AM" && hours === 12) hours = 0;

  const start = new Date(2000, 0, 1, hours, minutes);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const format = (d) =>
    `${d.getHours().toString().padStart(2, "0")}${d
      .getMinutes()
      .toString()
      .padStart(2, "0")}00`;

  return { start: format(start), end: format(end) };
};

/**
 * Replace {{placeholders}} with values from data object
 */
const fillTemplate = (template, data) => {
  return Object.entries(data).reduce(
    (acc, [key, value]) =>
      acc.replace(new RegExp(`{{${key}}}`, "g"), value ?? ""),
    template
  );
};

/**
 * Send appointment confirmation email
 */
const sendMail = async (to, subject, appointment) => {
  if (!appointment) {
    console.error("❌ Appointment data missing");
    return;
  }

  try {
    // slotDate: "24_8_2025", slotTime: "04:00 PM"
    const [dStr, mStr, yStr] = String(appointment.slotDate).split("_");
    const day = parseInt(dStr, 10);
    const month = parseInt(mStr, 10);
    const year = parseInt(yStr, 10);
    const pad2 = (n) => String(n).padStart(2, "0");

    // For human display in email
    const slotDateHuman = `${pad2(day)}-${pad2(month)}-${year}`;

    // Google Calendar expects YYYYMMDDTHHMMSS
    const calendarDate = `${year}${pad2(month)}${pad2(day)}`;
    const calendarTime = formatTimeForCalendar(appointment.slotTime); // { start: "HHMM00", end: "HHMM00" }
    const gStart = `${calendarDate}T${calendarTime.start}`;
    const gEnd = `${calendarDate}T${calendarTime.end}`;

    // Calendar URL with timezone and proper encoding
    const title = `Vet appointment with Dr. ${appointment.docData.name} — ${appointment.docData.clinicName}`;
    const locationStr = [
      appointment.docData.clinicName,
      appointment.docData.address?.line1,
      appointment.docData.address?.line2,
    ]
      .filter(Boolean)
      .join(", ");

    const details = `This is a reminder for your pet appointment.

Doctor: Dr. ${appointment.docData.name}
Clinic: ${appointment.docData.clinicName}
When: ${slotDateHuman} at ${appointment.slotTime} (IST)
Address: ${appointment.docData.address?.line1 || ""} ${appointment.docData.address?.line2 || ""}
Booking ID: ${appointment._id}

Manage your booking: https://ketpa-frontend.vercel.app/my-appointments`;

    const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
      title
    )}&dates=${gStart}/${gEnd}&ctz=Asia/Kolkata&details=${encodeURIComponent(
      details
    )}&location=${encodeURIComponent(locationStr)}`;

    // Maps URL (use provided link if valid, else build Google Maps search)
    const mapsQueryParts = [
      appointment.docData.clinicName,
      appointment.docData.address?.line1,
      appointment.docData.address?.line2,
    ].filter(Boolean);
    const fallbackMaps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      mapsQueryParts.join(", ")
    )}`;
    const mapsUrl =
      appointment.docData?.location &&
      /^https?:\/\//i.test(appointment.docData.location)
        ? appointment.docData.location
        : fallbackMaps;

    const data = {
      patientName: appointment.userData.name,
      dateFormatted: slotDateHuman,
      timeFormatted: appointment.slotTime,
      timezone: "IST",
      doctorName: appointment.docData.name,
      clinicName: appointment.docData.clinicName,
      addressLine1: appointment.docData.address?.line1 || "",
      addressLine2: appointment.docData.address?.line2 || "",
      bookingId: appointment._id,
      viewAppointmentUrl: "https://ketpa-frontend.vercel.app/my-appointments",
      addToCalendarUrl: calendarUrl,
      mapsUrl,
      rescheduleUrl: "https://ketpa-frontend.vercel.app/my-appointments",
      year: new Date().getFullYear(),
      city: "Bangalore",
    };

    let template = `
      <span style="display:none !important;">Your appointment is confirmed. See details inside.</span>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f9fafb; padding:24px; font-family:Arial, Helvetica, sans-serif;">
        <tr><td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e5e7eb;">
            <tr><td align="center" style="padding:32px 16px;">
              <img src="https://res.cloudinary.com/dxdzv6lcp/image/upload/v1755963347/e2yr2lshgom6rxmsvypm.png" alt="Ketpa" width="100" style="margin-bottom:16px;"/>
              <div style="font-size:22px; font-weight:600; color:#111827;">Appointment Confirmed</div>
              <div style="font-size:14px; color:#6b7280; margin-top:6px;">Thank you for booking with Ketpa</div>
            </td></tr>
            <tr><td style="padding:0 32px 24px; color:#374151; font-size:15px; line-height:1.6;">
              Hello <strong>{{patientName}}</strong>,<br><br>
              Your appointment has been <span style="color:#059669; font-weight:600;">confirmed</span>. We look forward to seeing you!
            </td></tr>
            <tr><td style="padding:0 32px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px;">
                <tr><td style="padding:16px; font-size:14px; color:#374151; line-height:1.6;">
                  <div><strong>Date:</strong> {{dateFormatted}}</div>
                  <div><strong>Time:</strong> {{timeFormatted}} <span style="color:#6b7280;">{{timezone}}</span></div>
                  <div><strong>Doctor:</strong> Dr. {{doctorName}}</div>
                  <div><strong>Clinic:</strong> {{clinicName}}</div>
                  <div><strong>Location:</strong><br>{{addressLine1}}<br>{{addressLine2}}</div>
                  <div><strong>Booking ID:</strong> {{bookingId}}</div>
                </td></tr>
              </table>
            </td></tr>
            <!-- CTAs on the same line -->
            <tr><td align="center" style="padding:20px;">
              <a href="{{addToCalendarUrl}}" target="_blank" rel="noopener noreferrer"
                style="display:inline-block; padding:12px 20px; color:#ffffff; background:#0a8f3c; text-decoration:none; font-weight:bold; font-size:14px; border-radius:8px; margin-right:8px;">
                Add to Calendar
              </a>
              <a href="{{mapsUrl}}" target="_blank" rel="noopener noreferrer"
                style="display:inline-block; padding:12px 20px; color:#1f2937; background:#eef2ff; text-decoration:none; font-weight:bold; font-size:14px; border-radius:8px;">
                View on Map
              </a>
            </td></tr>
            <tr><td style="padding:24px 32px; font-size:13px; color:#6b7280; border-top:1px solid #f3f4f6;">
              Have questions or need to reschedule?
              <a href="{{rescheduleUrl}}" style="color:#2563eb; text-decoration:none;">Manage booking</a>
              or email us at <a href="mailto:ketpaforpets@gmail.com" style="color:#2563eb; text-decoration:none;">ketpaforpets@gmail.com</a>.
            </td></tr>
            <tr><td align="center" style="background:#f9fafb; padding:16px;">
              <div style="color:#9ca3af; font-size:12px; line-height:18px;">
                © {{year}} Ketpa. All rights reserved.<br/>Ketpa Clinics, {{city}}, India
              </div>
            </td></tr>
          </table>
        </td></tr>
      </table>
    `;

    const html = fillTemplate(template, data);

    await transporter.sendMail({
      from: `"Ketpa Appointments" <${process.env.USER}>`,
      to,
      subject,
      html,
    });

    console.log("✅ Email sent successfully to", to);
  } catch (error) {
    console.error("❌ Error sending email:", error.message);
  }
};

/**
 * Send verification OTP email
 */
export const sendVerificationEmail = async (to, otp) => {
  try {
    const subject = "Verify your email • Ketpa OTP";
    const html = `
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f9fafb; padding:24px; font-family:Arial, Helvetica, sans-serif;">
        <tr><td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e5e7eb;">
            <tr><td align="center" style="padding:28px 16px;">
              <img src="https://res.cloudinary.com/dxdzv6lcp/image/upload/v1755963347/e2yr2lshgom6rxmsvypm.png" alt="Ketpa" width="90" style="margin-bottom:14px;"/>
              <div style="font-size:20px; font-weight:600; color:#111827;">Verify your email</div>
              <div style="font-size:14px; color:#6b7280; margin-top:6px;">Use the OTP below to complete verification</div>
            </td></tr>
            <tr><td align="center" style="padding:0 24px 8px;">
              <div style="display:inline-block; padding:14px 18px; font-size:26px; letter-spacing:4px; font-weight:700; color:#111827; background:#f3f4f6; border-radius:10px;">
                ${otp}
              </div>
              <div style="margin-top:8px; font-size:12px; color:#6b7280;">
                This code expires in 10 minutes.
              </div>
            </td></tr>
            <tr><td style="padding:16px 24px 24px; font-size:13px; color:#6b7280;">
              If you didn’t request this, you can safely ignore this email.
            </td></tr>
            <tr><td align="center" style="background:#f9fafb; padding:14px;">
              <div style="color:#9ca3af; font-size:11px;">
                © ${new Date().getFullYear()} Ketpa. All rights reserved.
              </div>
            </td></tr>
          </table>
        </td></tr>
      </table>
    `;

    await transporter.sendMail({
      from: `"Ketpa" <${process.env.USER}>`,
      to,
      subject,
      html,
      text: `Your Ketpa OTP is ${otp}. It expires in 10 minutes.`,
    });

    console.log("✅ Verification OTP sent to", to);
  } catch (error) {
    console.error("❌ Error sending verification email:", error.message);
  }
};

export default sendMail;