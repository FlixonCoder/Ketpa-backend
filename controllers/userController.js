// ==============================
// 📌 Imports
// ==============================
import validator from "validator";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";

import userModel from "../models/userModel.js";
import doctorModel from "../models/doctorModel.js";
import appointmentModel from "../models/appointmentModel.js";
import sendMail, { sendVerificationEmail} from "./mailer.js";

// ==============================
// 📌 Utility Functions
// ==============================

// Strong password validation: min 8 chars, 1 uppercase, 1 lowercase, 1 number
function isStrongPassword(password) {
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  return regex.test(password);
}

// Indian phone validation
function isValidPhone(phone) {
  const regex = /^(\+91\s)?[6-9]\d{4}\s?\d{5}$/;
  return regex.test(phone);
}

// Format phone number to +91 XXXXX XXXXX
function formatIndianPhone(input) {
  let digits = input.replace(/\D/g, "");

  if (digits.startsWith("91") && digits.length > 10) {
    digits = digits.slice(-10);
  }

  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }

  return input; // return raw if incomplete
}

// ==============================
// 📌 User APIs
// ==============================

// Register User
const registerUser = async (req, res) => {
  try {
    const { name, email, phone, password, confirmPassword, pet } = req.body;

    // Validation
    if (!email || !name || !phone || !password || !confirmPassword || !pet) {
      return res.json({ success: false, message: "Missing Details" });
    }

    if (!validator.isEmail(email)) {
      return res.json({ success: false, message: "Enter a valid email." });
    }

    const formattedPhone = formatIndianPhone(phone);
    if (!isValidPhone(formattedPhone)) {
      return res.json({ success: false, message: "Enter valid phone number." });
    }

    if (!isStrongPassword(password)) {
      return res.json({
        success: false,
        message:
          "Password must be at least 8 characters long, include uppercase, lowercase, and a number.",
      });
    }

    if (password !== confirmPassword) {
      return res.json({ success: false, message: "Passwords do not match." });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    const newUser = new userModel({
      name,
      email,
      phone,
      pet,
      password: hashedPassword,
      otp,
      otpExpiry: expiry,
    });

    await newUser.save();

    await sendVerificationEmail(email, otp);

    res.json({
      success: true,
      message: "Account created. Please verify your email using the OTP sent.",
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await userModel.findOne({ email });

    if (!user) return res.json({ success: false, message: "User not found" });

    if (user.isVerified) {
      return res.json({ success: true, message: "Email already verified" });
    }

    if (user.otp !== otp || user.otpExpiry < new Date()) {
      return res.json({ success: false, message: "Invalid or expired OTP" });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res.json({ success: true, token, message: "Email verified successfully" });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

// Login User
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await userModel.findOne({ email });
    if (!user) {
      return res.json({ success: false, message: "User does not exist" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.json({ success: false, message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res.json({ success: true, token, message: "Login success." });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: error.message });
  }
};

// Get User Profile
const getProfile = async (req, res) => {
  try {
    const { userId } = req.body;
    const userData = await userModel.findById(userId).select("-password");

    res.json({ success: true, userData });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: error.message });
  }
};

// Update User Profile
const updateProfile = async (req, res) => {
  try {
    const { userId, name, address, dob, gender, aboutPet } = req.body;
    const imageFile = req.file;

    if (!name || !dob || !gender || !aboutPet) {
      return res.json({ success: false, message: "Data missing" });
    }

    await userModel.findByIdAndUpdate(userId, {
      name,
      address: JSON.parse(address),
      dob,
      gender,
      aboutPet,
    });

    if (imageFile) {
      const upload = await cloudinary.uploader.upload(imageFile.path, {
        resource_type: "image",
      });
      await userModel.findByIdAndUpdate(userId, { image: upload.secure_url });
    }

    res.json({ success: true, message: "Profile Updated" });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: error.message });
  }
};

// resend OTP
const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.json({ success: false, message: "Email is required" });
    }

    const user = await userModel.findOne({ email });
    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000);

    user.otp = otp;
    user.otpExpiry = expiry;
    await user.save();

    await sendVerificationEmail(email, otp);

    res.json({ success: true, message: "OTP resent successfully" });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: error.message });
  }
};


// ==============================
// 📌 Appointment APIs
// ==============================

// Book Appointment
const bookAppointment = async (req, res) => {
  try {
    const { userId, docId, slotDate, slotTime } = req.body;

    const docData = await doctorModel.findById(docId).select("-password");
    const userData = await userModel.findById(userId).select("-password");

    if (!userData.isVerified) {
      return res.json({success:false,message:"Verify your email to book appointments."})
    }

    if (!docData.available) {
      return res.json({ success: false, message: "Doctor not available" });
    }

    // Limit ongoing appointments
    const ongoing = await appointmentModel.find({ userId });
    const activeAppointments = ongoing.filter(
      (a) => !a.iscompleted && !a.cancelled
    );
    if (activeAppointments.length >= 2) {
      return res.json({
        success: false,
        message: "You already have 2 appointments pending",
      });
    }

    // Check for slot availability
    let slots_booked = docData.slots_booked || {};
    if (!userData.phone || userData.phone === "0000000000") {
      return res.json({
        success: false,
        message: "Please add a valid phone number to profile",
      });
    }

    if (!slots_booked[slotDate]) slots_booked[slotDate] = [];
    if (slots_booked[slotDate].includes(slotTime)) {
      return res.json({ success: false, message: "Slot not available" });
    }
    slots_booked[slotDate].push(slotTime);

    // Save Appointment
    const appointmentData = {
      userId,
      docId,
      userData,
      docData,
      amount: docData.fees,
      slotDate,
      slotTime,
      date: Date.now(),
    };

    const newAppointment = await new appointmentModel(appointmentData).save();

    // Update Doctor slots
    await doctorModel.findByIdAndUpdate(docId, { slots_booked });

    // Populate & Send Mail
    const savedAppointment = await appointmentModel
      .findById(newAppointment._id)
      .populate("userId", "-password")
      .populate("docId", "-password");

    sendMail(
      userData.email,
      "Your Appointment has been confirmed.",
      savedAppointment
    );
    sendMail(docData.email, "You've got a new appointment", savedAppointment);

    res.json({
      success: true,
      message:
        "Appointment Booked. A confirmation email will be sent to your registered email.",
    });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: error.message });
  }
};

// List User Appointments
const listAppointment = async (req, res) => {
  try {
    const { userId } = req.body;
    const appointments = await appointmentModel.find({ userId });

    res.json({ success: true, appointments });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: error.message });
  }
};

// Cancel Appointment
const cancelAppointment = async (req, res) => {
  try {
    const { userId, appointmentId } = req.body;

    const appointmentData = await appointmentModel.findById(appointmentId);

    if (appointmentData.userId != userId) {
      return res.json({ success: false, message: "Unauthorized action" });
    }

    await appointmentModel.findByIdAndUpdate(appointmentId, {
      cancelled: true,
    });

    // Free Doctor slot
    const { docId, slotDate, slotTime } = appointmentData;
    const doctorData = await doctorModel.findById(docId);

    doctorData.slots_booked[slotDate] = doctorData.slots_booked[
      slotDate
    ].filter((e) => e !== slotTime);

    await doctorModel.findByIdAndUpdate(docId, {
      slots_booked: doctorData.slots_booked,
    });

    res.json({ success: true, message: "Appointment Cancelled" });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: error.message });
  }
};

// ==============================
// 📌 Exports
// ==============================
export {
  registerUser,
  loginUser,
  getProfile,
  updateProfile,
  bookAppointment,
  listAppointment,
  cancelAppointment,
  verifyOtp,
  resendOtp,
};
