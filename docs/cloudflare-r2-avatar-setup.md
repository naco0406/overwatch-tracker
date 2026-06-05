# Cloudflare R2 Avatar Setup

이 서비스의 프로필 이미지는 Cloudflare R2에 저장하고, Supabase에는 공개 HTTPS URL만 저장한다.

## 권장 구조

1. 브라우저에서 이미지를 정사각형으로 crop/resize 한다.
2. 512px WebP로 변환하고 1MB 이하로 제한한다.
3. 브라우저가 Supabase access token을 포함해 Cloudflare Worker로 업로드한다.
4. Worker가 Supabase Auth로 사용자를 검증한다.
5. Worker가 R2 binding으로 이미지를 저장한다.
6. Worker가 공개 URL을 반환하면 앱이 Supabase `user_profiles.avatar_url`에 저장한다.

브라우저에는 R2 access key와 secret key를 절대 노출하지 않는다. Worker + R2 binding 구조에서는 R2 API token도 필요 없다.

## Bucket

Cloudflare Dashboard에서 R2 Object Storage로 이동해 버킷을 만든다.

권장 이름:

```text
overwatch-tracker-assets
```

권장 object key:

```text
avatars/{userId}/{timestamp}.webp
```

이렇게 저장하면 사용자별 파일 정리, 이전 이미지 정리, 캐시 무효화가 단순해진다.

## Public Domain

프로덕션에서는 `r2.dev` 대신 커스텀 도메인을 붙인다.

권장 예시:

```text
assets.your-domain.com
```

Cloudflare Dashboard에서 해당 R2 bucket의 Settings로 이동한 뒤 Custom Domains에 도메인을 연결한다. 이 도메인은 표시용 URL에만 사용한다.

예시:

```text
https://assets.your-domain.com/avatars/{userId}/20260605.webp
```

## CORS

이미지 조회는 R2 custom domain을 통해 이루어진다. Worker가 R2에 직접 저장하므로 R2 bucket CORS는 조회 기준으로 설정한다.

개발과 프로덕션 origin을 모두 넣는다.

```json
[
  {
    "AllowedOrigins": ["http://localhost:5173", "https://your-app-domain.com"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

Dashboard 경로:

```text
R2 Object Storage -> bucket 선택 -> Settings -> CORS Policy -> Add CORS policy
```

## Worker

Cloudflare Worker에 R2 binding을 연결한다.

```text
Binding type: R2 bucket
Variable name: AVATAR_BUCKET
Bucket: overwatch-tracker-assets
```

Worker 환경 변수:

```text
SUPABASE_URL=https://{project-ref}.supabase.co
SUPABASE_ANON_KEY={supabase publishable key}
R2_PUBLIC_BASE_URL=https://assets-ow.naco.kr
ALLOWED_ORIGINS=https://ow.naco.kr,http://localhost:5173
```

Worker custom domain:

```text
https://api-ow.naco.kr
```

현재 Worker 코드:

```text
workers/avatar-upload/index.js
```

Dashboard에서 `ow-avatar-upload -> Edit code`에 이 파일 내용을 붙여넣고 Deploy 한다.

## Frontend

앱 환경 변수:

```text
VITE_AVATAR_UPLOAD_URL=https://api-ow.naco.kr
```

로컬에서는 `.env.local`, 배포 환경에서는 호스팅 플랫폼의 환경 변수에 추가한다.

## Supabase

이미지 파일은 Supabase Storage에 올리지 않는다.

Supabase에는 아래 필드만 저장한다.

```text
user_profiles.avatar_url
user_profiles.avatar_updated_at
```

현재 마이그레이션:

```text
supabase/migrations/20260605030000_profile_avatar_url.sql
```

## Upload API

Worker는 다음 API를 제공한다.

```text
PUT https://api-ow.naco.kr/avatars/upload
```

요청 헤더:

```text
Authorization: Bearer {supabaseAccessToken}
Content-Type: image/webp
```

응답:

```json
{
  "publicUrl": "https://assets.your-domain.com/avatars/...",
  "key": "avatars/{userId}/20260605.webp"
}
```

현재 Worker 예시 코드:

```text
workers/avatar-upload/index.js
```

Cloudflare Dashboard에서 `ow-avatar-upload -> Edit code`로 들어가 이 파일의 내용을 붙여넣고 Deploy 한다.

서버는 반드시 다음을 검증한다.

- 로그인 사용자
- 허용된 MIME type: `image/webp`, `image/png`, `image/jpeg`
- 최대 파일 크기
- object key가 현재 사용자 prefix 아래인지

## References

- Cloudflare R2 public buckets: https://developers.cloudflare.com/r2/buckets/public-buckets/
- Cloudflare R2 CORS: https://developers.cloudflare.com/r2/buckets/cors/
- Cloudflare R2 presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- Cloudflare Workers R2 upload tutorial: https://developers.cloudflare.com/workers/tutorials/upload-assets-with-r2/
