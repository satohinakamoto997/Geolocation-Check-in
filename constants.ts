
import { LocationPoint } from './types';

export const CHECKIN_POINTS: (LocationPoint & { periodId: number | string })[] = [
  // ช่วงเวลา 1: 10:30 ถึง 13:00
  { id: 101, periodId: 1, name: "ถนนศรีวรา", lat: 13.7706156, lng: 100.6073910, startTime: "10:30", endTime: "12:49" },
  { id: 102, periodId: 1, name: "เดอะซีน", lat: 13.7735708, lng: 100.6100072, startTime: "10:30", endTime: "12:49" },
  { id: 103, periodId: 1, name: "แม็คโคร ฟู้ดเซอร์วิส บดินทร์เดชา", lat: 13.7709566, lng: 100.6145961, startTime: "10:30", endTime: "12:49" },
  { id: 104, periodId: 1, name: "ซอย ลาดพร้าว 122", lat: 13.7762765, lng: 100.6233867, startTime: "10:30", endTime: "12:49" },
  { id: 105, periodId: 1, name: "ลาดพร้าว 80", lat: 13.7826917, lng: 100.6047745, startTime: "10:30", endTime: "12:49" },

  // ช่วงเวลา 2: 12:50 ถึง 16:30
  { id: 201, periodId: 2, name: "ลาดพร้าว 80", lat: 13.7826917, lng: 100.6047745, startTime: "12:50", endTime: "16:29" },
  { id: 202, periodId: 2, name: "ซอย ลาดพร้าว 122", lat: 13.7762765, lng: 100.6233867, startTime: "12:50", endTime: "16:29" },
  { id: 203, periodId: 2, name: "แม็คโคร ฟู้ดเซอร์วิส บดินทร์เดชา", lat: 13.7709566, lng: 100.6145961, startTime: "12:50", endTime: "16:29" },
  { id: 204, periodId: 2, name: "เดอะซีน", lat: 13.7735708, lng: 100.6100072, startTime: "12:50", endTime: "16:29" },
  { id: 205, periodId: 2, name: "ถนนศรีวรา", lat: 13.7706156, lng: 100.6073910, startTime: "12:50", endTime: "16:29" },

  // ช่วงเวลา 3: 16:30 ถึง 19:30
  { id: 301, periodId: 3, name: "ซอย ลาดพร้าว 122", lat: 13.7762765, lng: 100.6233867, startTime: "16:30", endTime: "19:30" },
  { id: 302, periodId: 3, name: "ลาดพร้าว 80", lat: 13.7826917, lng: 100.6047745, startTime: "16:30", endTime: "19:30" },
  { id: 303, periodId: 3, name: "ถนนศรีวรา", lat: 13.7706156, lng: 100.6073910, startTime: "16:30", endTime: "19:30" },
  { id: 304, periodId: 3, name: "เดอะซีน", lat: 13.7735708, lng: 100.6100072, startTime: "16:30", endTime: "19:30" },
  { id: 305, periodId: 3, name: "แม็คโคร ฟู้ดเซอร์วิส บดินทร์เดชา", lat: 13.7709566, lng: 100.6145961, startTime: "16:30", endTime: "19:30" },

  // // ช่วงเวลาเทสระบบ: 19:30 ถึง 05:00
  // { id: 999, periodId: "TEST", name: "จุดทดสอบระบบ", lat: 13.734950435547592, lng: 100.62137142854893, startTime: "19:30", endTime: "05:00" }
];

export const DISTANCE_THRESHOLD_METERS = 200;
