import validator from 'validator'
import bcrypt from 'bcrypt'
import userModel from '../models/userModel.js'
import jwt from 'jsonwebtoken'
import { v2 as cloudinary } from 'cloudinary';
import doctorModel from '../models/doctorModel.js';
import appointmentModel from '../models/appointmentModel.js';


function isStrongPassword(password) {
  // Minimum 8 chars, 1 uppercase, 1 lowercase, 1 number
  const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  return strongPasswordRegex.test(password);
}

function isValidPhone(phone) {
  const regex = /^(\+91\s)?[6-9]\d{4}\s?\d{5}$/;
  return regex.test(phone);
}

function formatIndianPhone(input) {
  // Remove non-digits
  let digits = input.replace(/\D/g, '');

  // If starts with 91 and is longer than 10, trim to last 10
  if (digits.startsWith("91") && digits.length > 10) {
    digits = digits.slice(digits.length - 10);
  }

  // If exactly 10 digits, format as +91 XXXXX XXXXX
  if (digits.length === 10) {
    return `+91 ${digits.slice(0,5)} ${digits.slice(5)}`;
  }

  return input; // return raw if not complete
}

// API to register user
const registerUser = async (req,res) => {
    try {
        const {name, email, phone, password, confirmPassword, pet} = req.body

        if (!email || !name || !phone || !password || !pet || !confirmPassword) {
            return res.json({success:false, message:"Missing Details"})
        }

        if (!validator.isEmail(email)) {
            return res.json({success:false, message:"Enter a valid email."})
        }

        const formattedPhone = formatIndianPhone(phone)
        if (!isValidPhone(formattedPhone)) {
            return res.json({success:false,message:"Enter valid phone number."})
        }

        if (!isStrongPassword(password)) {
            return res.json({success:false, message:"Password must be at least 8 characters long, include uppercase, lowercase, and a number."})
        }

        if (password !== confirmPassword) {
            return res.json({success:false, message:"The passwords do not match."})
        }

        // Hashing the password
        const salt = await bcrypt.genSalt(10)
        const hashedPassword = await bcrypt.hash(password, salt)

        const userData = {
            name,
            email,
            password : hashedPassword,
            phone,
            pet
        }

        const newUser = new userModel(userData)
        const user = await newUser.save()
        
        const token = jwt.sign({id:user._id}, process.env.JWT_SECRET)

        res.json({success:true,token,message:"Account creation success."})

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

// API for user login
const loginUser = async (req,res) => {
    try {
        
        const {email,password} = req.body
        const user = await userModel.findOne({email})

        if (!user) {
            return res.json({success:false,message:"User does not exist"})
        }
        const isMatch = await bcrypt.compare(password,user.password)

        if (isMatch) {
            const token = jwt.sign({id:user._id}, process.env.JWT_SECRET)
            res.json({success:true,token,message:"Login success."})
        } else {
            res.json({success:false,message:"Invalid credentials"})
        }

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

// API to get user profile data
const getProfile = async (req,res) => {
    try {
        
        const { userId } = req.body
        const userData = await userModel.findById(userId).select('-password')
        res.json({success:true,userData})

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

// API to update user profile
const updateProfile = async (req,res) => {
    try {
        
        const {userId, name, address, dob, gender, aboutPet} = req.body
        const imageFile = req.file

        if (!name || !dob || !gender || !aboutPet) {
            return res.json({success:false,message:"Data missing"})
        }

        await userModel.findByIdAndUpdate(userId, {name,phone:formattedPhone,address:JSON.parse(address), dob,gender, aboutPet})

        if (imageFile) {

            // Upload image to cloudinary
            const imageUpload = await cloudinary.uploader.upload(imageFile.path,{resource_type:'image'})
            const imageURL = imageUpload.secure_url

            await userModel.findByIdAndUpdate(userId,{image:imageURL})

        }

        res.json({success:true,message:"Profile Updated"})

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

// API to book appointment
const bookAppointment = async (req,res) => {

    try {
        
        const {userId, docId, slotDate, slotTime} = req.body

        const docData = await doctorModel.findById(docId).select('-password')
        const userData = await userModel.findById(userId).select('-password')

        if (!docData.available) {
            return res.json({success:false,message:"Doctor not available"})
        }

        let slots_booked = docData.slots_booked

        // Checking for free slots
        if (!userData.phone || userData.phone === "0000000000") {
            return res.json({success:false,message:"To book an appointment add contact number to profile"})
        } else {
            if (slots_booked[slotDate]) {
                if (slots_booked[slotDate].includes(slotTime)) {
                    return res.json({success:false,message:"Slot not available"})
                } else {
                    slots_booked[slotDate].push(slotTime)
                }
            } else {
                slots_booked[slotDate] = []
                slots_booked[slotDate].push(slotTime)
            }
        }



        delete docData.slots_booked

        const appointmentData = {
            userId,
            docId,
            userData,
            docData,
            amount:docData.fees,
            slotTime,
            slotDate,
            date: Date.now()
        }

        const newAppointment = new appointmentModel(appointmentData)
        await newAppointment.save()

        // save new slots data in docData
        await doctorModel.findByIdAndUpdate(docId, {slots_booked})

        res.json({success:true,message:"Appointment Booked"})

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }

}

// API to get User appointments for fromtend my-appointment page
const listAppointment = async (req,res) => {
    try {
        
        const {userId} = req.body
        const appointments = await appointmentModel.find({userId})

        res.json({success:true,appointments})

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

// API to cancel appointment
const cancelAppointment = async (req,res) => {
    try {
        
        const {userId, appointmentId} = req.body

        const appointmentData = await appointmentModel.findById(appointmentId)

        // Verify appointment user
        if (appointmentData.userId != userId) {
            return res.json({success:false, message:"Unauthorized action"})
        }

        await appointmentModel.findByIdAndUpdate(appointmentId, {cancelled:true})

        // Releasing doctor slot
        const {docId, slotDate, slotTime} = appointmentData

        const doctorData = await doctorModel.findById(docId)

        let slots_booked = doctorData.slots_booked

        slots_booked[slotDate] = slots_booked[slotDate].filter(e => e !== slotTime)

        await doctorModel.findByIdAndUpdate(docId, {slots_booked})

        res.json({success:true,message:"Appointment Cancelled"})

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

// ==============================
// ====Payment Gateway 11:35=====
// ==============================

export {registerUser, loginUser, getProfile, updateProfile, bookAppointment, listAppointment, cancelAppointment}