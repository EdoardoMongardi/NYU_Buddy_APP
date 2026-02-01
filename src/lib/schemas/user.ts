import { z } from 'zod';

const ENV_ADMINS = process.env.NEXT_PUBLIC_ADMIN_EMAILS?.split(',').filter(Boolean) || [];
const HARDCODED_ADMINS = [
  'edoardo.mongardi18@gmail.com',
  '468327494@qq.com',
];
const ADMIN_EMAILS = [...ENV_ADMINS, ...HARDCODED_ADMINS].map(email => email.trim().toLowerCase());

const isAllowedEmail = (email: string) => {
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith('@nyu.edu') || ADMIN_EMAILS.includes(normalized);
};

export const loginSchema = z.object({
  email: z
    .string()
    .email('Please enter a valid email address')
    .refine(
      isAllowedEmail,
      'Only @nyu.edu email addresses are allowed'
    ),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const registerSchema = z
  .object({
    email: z
      .string()
      .email('Please enter a valid email address')
      .refine(
        isAllowedEmail,
        'Only @nyu.edu email addresses are allowed'
      ),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const onboardingSchema = z.object({
  displayName: z
    .string()
    .min(2, 'Display name must be at least 2 characters')
    .max(50, 'Display name must be at most 50 characters'),
  interests: z
    .array(z.string())
    .min(1, 'Please select at least one interest')
    .max(10, 'Please select at most 10 interests'),
  preferredActivities: z
    .array(z.string())
    .min(1, 'Please select at least one activity')
    .max(5, 'Please select at most 5 activities'),
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
export type OnboardingFormData = z.infer<typeof onboardingSchema>;

// Firestore user document type
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;  // Optional, uses default avatar if not set
  interests: string[];
  preferredActivities: string[];
  profileCompleted: boolean;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Activity and interest options
export const ACTIVITIES = [
  'Coffee',
  'Lunch',
  'Study',
  'Walk',
  'Explore Campus',
] as const;

export const INTERESTS = [
  'Computer Science',
  'Data Science',
  'Business',
  'Arts',
  'Music',
  'Sports',
  'Gaming',
  'Reading',
  'Movies',
  'Travel',
  'Photography',
  'Cooking',
  'Fitness',
  'Technology',
  'Entrepreneurship',
  'Design',
  'Writing',
  'Languages',
  'Volunteering',
  'Finance',
] as const;