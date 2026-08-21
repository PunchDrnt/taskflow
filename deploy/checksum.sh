#!/bin/sh
# พิมพ์ checksum ของไฟล์ที่ server ใช้รันจริง
#
# CI คำนวณจาก repo แล้วส่งมาให้ server คำนวณของตัวเองเทียบ · ไม่ตรงแปลว่าไฟล์บน
# เครื่องเก่ากว่า commit ที่กำลัง deploy ซึ่ง `docker compose pull` แก้ให้ไม่ได้
# เพราะไฟล์พวกนี้อ่านจากดิสก์ ไม่ได้ฝังใน image
#
#     cd deploy && ./checksum.sh
#
# ตัด docs/ ออกเพราะ server ไม่ได้ใช้ · ตัด .env ออกเพราะสองฝั่งต่างกันโดยตั้งใจ
# -print0 / -z / -0 เผื่อชื่อไฟล์มีช่องว่าง · LC_ALL=C ให้เรียงเหมือนกันทุกเครื่อง
set -eu

cd "$(dirname "$0")"

find . -type f -not -path './docs/*' -not -name '.env' -print0 \
  | LC_ALL=C sort -z \
  | xargs -0 sha256sum \
  | sha256sum \
  | cut -d' ' -f1
