use crate::auth::ClaimsUser;
use chrono::NaiveDateTime;
use sqlx::PgPool;

#[derive(sqlx::FromRow, Debug, Clone)]
pub struct DbUser {
    pub id: String,
    pub name: String,
    pub email: String,
    pub email_verified: bool,
    pub image: Option<String>,
    pub trial_started_at: NaiveDateTime,
}

pub async fn ensure_user(pool: &PgPool, fb: &ClaimsUser) -> Result<DbUser, sqlx::Error> {
    let name = fb
        .name
        .clone()
        .or_else(|| fb.email.clone())
        .unwrap_or_else(|| fb.uid.clone());
    let email = fb.email.clone().unwrap_or_default();

    let existing = sqlx::query_as::<_, DbUser>(
        r#"SELECT id, name, email, email_verified, image, trial_started_at FROM "user" WHERE id = $1"#,
    )
    .bind(&fb.uid)
    .fetch_optional(pool)
    .await?;
    if let Some(u) = existing {
        return Ok(u);
    }

    let mut tx = pool.begin().await?;

    let inserted = sqlx::query_as::<_, DbUser>(
        r#"INSERT INTO "user" (id, name, email, email_verified, image, created_at, updated_at, trial_started_at)
           VALUES ($1, $2, $3, true, $4, now(), now(), now())
           ON CONFLICT (id) DO NOTHING
           RETURNING id, name, email, email_verified, image, trial_started_at"#,
    )
    .bind(&fb.uid)
    .bind(&name)
    .bind(&email)
    .bind(&fb.picture)
    .fetch_optional(&mut *tx)
    .await?;

    let inserted = match inserted {
        Some(u) => u,
        None => {
            tx.commit().await?;
            return sqlx::query_as::<_, DbUser>(
                r#"SELECT id, name, email, email_verified, image, trial_started_at FROM "user" WHERE id = $1"#,
            )
            .bind(&fb.uid)
            .fetch_one(pool)
            .await;
        }
    };

    sqlx::query(
        "INSERT INTO onboarding_progress (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
    )
    .bind(&inserted.id)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        r#"INSERT INTO credit_account (id, user_id, balance, last_weekly_grant_at)
           VALUES (gen_random_uuid(), $1, 0, now() - interval '7 days')
           ON CONFLICT (user_id) DO NOTHING"#,
    )
    .bind(&inserted.id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    tracing::info!(user_id = %inserted.id, "provisioned new user");
    Ok(inserted)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[sqlx::test(migrations = "./migrations")]
    async fn provisions_new_user_with_hooks(pool: PgPool) {
        let cu = ClaimsUser {
            uid: "user-1".to_string(),
            email: Some("a@test.com".to_string()),
            name: Some("Test User".to_string()),
            picture: None,
        };
        let u = ensure_user(&pool, &cu).await.unwrap();
        assert_eq!(u.id, "user-1");
        assert_eq!(u.email, "a@test.com");
        assert!(u.email_verified);

        let (onboard_count, credit_balance): (i64, i32) = sqlx::query_as(
            "SELECT (SELECT count(*) FROM onboarding_progress WHERE user_id=$1), \
                    (SELECT balance FROM credit_account WHERE user_id=$1)",
        )
        .bind(&u.id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(onboard_count, 1);
        assert_eq!(credit_balance, 0);
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn does_not_reprovision_existing_user(pool: PgPool) {
        let cu = ClaimsUser {
            uid: "user-1".to_string(),
            email: Some("a@test.com".to_string()),
            name: Some("Test User".to_string()),
            picture: None,
        };
        let first = ensure_user(&pool, &cu).await.unwrap();
        let second = ensure_user(&pool, &cu).await.unwrap();
        assert_eq!(first.id, second.id);
        let count: i64 =
            sqlx::query_scalar("SELECT count(*) FROM onboarding_progress WHERE user_id=$1")
                .bind(&first.id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count, 1);
    }
}
