import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Setup transporter once (singleton style)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.USER,
    pass: process.env.PASSWORD,
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
  const end = new Date(start.getTime() + 60 * 60 * 1000); // +1 hour

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
    const slotDate = appointment.slotDate.replace(/_/g, "-");
    const calendarDate = formatDateForCalendar(appointment.slotDate);
    const calendarTime = formatTimeForCalendar(appointment.slotTime);

    const startTime = `${calendarDate}/${calendarTime.start}`;
    const stopTime = `${calendarDate}/${calendarTime.end}`;

    const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=Ketpa%20Appointment&dates=${startTime}/${stopTime}&details=This%20is%20a%20reminder%20to%20your%20pet%20appointment&location=Event+Location`;

    const data = {
      patientName: appointment.userData.name,
      dateFormatted: slotDate,
      timeFormatted: appointment.slotTime,
      timezone: "IST",
      doctorName: appointment.docData.name,
      clinicName: appointment.docData.clinicName,
      addressLine1: appointment.docData.address.line1,
      addressLine2: appointment.docData.address.line2,
      bookingId: appointment._id,
      viewAppointmentUrl: "https://ketpa-frontend.vercel.app/my-appointments",
      addToCalendarUrl: calendarUrl,
      mapsUrl: appointment.docData.location,
      rescheduleUrl: "https://ketpa-frontend.vercel.app/my-appointments",
      year: new Date().getFullYear(),
      city: "Bangalore", // can make dynamic later
    };

    let template = `
      <!-- Preheader -->
      <span style="display:none !important;">
        Your appointment is confirmed. See details inside.
      </span>

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f9fafb; padding:24px; font-family:Arial, Helvetica, sans-serif;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e5e7eb;">
              
              <!-- Header -->
              <tr>
                <td align="center" style="padding:32px 16px;">
                  <img src="https://res.cloudinary.com/dxdzv6lcp/image/upload/v1755963347/e2yr2lshgom6rxmsvypm.png" alt="Ketpa" width="100" style="margin-bottom:16px;"/>
                  <div style="font-size:22px; font-weight:600; color:#111827;">Appointment Confirmed</div>
                  <div style="font-size:14px; color:#6b7280; margin-top:6px;">Thank you for booking with Ketpa</div>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:0 32px 24px; color:#374151; font-size:15px; line-height:1.6;">
                  Hello <strong>{{patientName}}</strong>,<br><br>
                  Your appointment has been <span style="color:#059669; font-weight:600;">confirmed</span>. We look forward to seeing you!
                </td>
              </tr>

              <!-- Appointment Summary -->
              <tr>
                <td style="padding:0 32px 32px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px;">
                    <tr>
                      <td style="padding:16px; font-size:14px; color:#374151; line-height:1.6;">
                        <div><strong>Date:</strong> {{dateFormatted}}</div>
                        <div><strong>Time:</strong> {{timeFormatted}} <span style="color:#6b7280;">{{timezone}}</span></div>
                        <div><strong>Doctor:</strong> Dr. {{doctorName}}</div>
                        <div><strong>Clinic:</strong> {{clinicName}}</div>
                        <div><strong>Location:</strong><br>{{addressLine1}}<br>{{addressLine2}}</div>
                        <div><strong>Booking ID:</strong> {{bookingId}}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- CTA -->
              <tr>
                <td align="center" style="padding:20px;">
                  <a href="{{addToCalendarUrl}}" target="_blank"
                    style="display:inline-block; padding:12px 20px; color:#ffffff; background:#0a8f3c; text-decoration:none; font-weight:bold; font-size:14px; border-radius:8px;">
                    Add to Calendar
                  </a>
                  <div style="margin-top:12px; font-size:12px; color:#6b7280;">
                    Need directions? <a href="{{mapsUrl}}" style="color:#013cfc; text-decoration:underline;">Open in Maps</a>
                  </div>
                </td>
              </tr>

              <!-- Support -->
              <tr>
                <td style="padding:24px 32px; font-size:13px; color:#6b7280; border-top:1px solid #f3f4f6;">
                  Have questions or need to reschedule?  
                  <a href="{{rescheduleUrl}}" style="color:#2563eb; text-decoration:none;">Manage booking</a>  
                  or email us at <a href="mailto:support@ketpa.com" style="color:#2563eb; text-decoration:none;">support@ketpa.com</a>.
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td align="center" style="background:#f9fafb; padding:16px;">
                  <div style="color:#9ca3af; font-size:12px; line-height:18px;">
                    © {{year}} Ketpa. All rights reserved.<br/>
                    Ketpa Clinics, {{city}}, India
                  </div>
                </td>
              </tr>

            </table>
          </td>
        </tr>
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

export default sendMail;
