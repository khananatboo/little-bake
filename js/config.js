/*
 * ตั้งค่าการเชื่อมต่อ Supabase (ไม่บังคับ)
 * ถ้าเว้นว่าง แอปจะถาม Project URL และ Publishable key ตอนเปิดครั้งแรกในแต่ละเครื่อง
 * ใส่ได้เฉพาะ Publishable key (หรือ anon key) ห้ามใส่ secret key / service_role key
 */
window.LB_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_KEY: ''
};
