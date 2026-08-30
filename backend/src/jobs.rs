use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use uuid::Uuid;

struct JobEntry<T> {
    value: T,
    created_at: Instant,
}

pub struct JobStore<T> {
    map: Mutex<HashMap<String, JobEntry<T>>>,
    ttl: Duration,
}

impl<T> JobStore<T> {
    pub fn new(ttl: Duration) -> Self {
        JobStore {
            map: Mutex::new(HashMap::new()),
            ttl,
        }
    }

    pub fn insert(&self, id: String, value: T) {
        let mut map = self.map.lock().expect("job store lock");
        map.insert(
            id,
            JobEntry {
                value,
                created_at: Instant::now(),
            },
        );
    }

    pub fn get(&self, id: &str) -> Option<T>
    where
        T: Clone,
    {
        let map = self.map.lock().expect("job store lock");
        map.get(id).map(|e| e.value.clone())
    }

    pub fn update(&self, id: &str, f: impl FnOnce(&mut T)) {
        let mut map = self.map.lock().expect("job store lock");
        if let Some(entry) = map.get_mut(id) {
            f(&mut entry.value);
            entry.created_at = Instant::now();
        }
    }

    pub fn gc(&self) {
        let mut map = self.map.lock().expect("job store lock");
        map.retain(|_, e| e.created_at.elapsed() < self.ttl);
    }
}

pub fn new_session_id() -> String {
    Uuid::new_v4().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn insert_get_update() {
        let store = JobStore::<String>::new(Duration::from_secs(60));
        store.insert("s1".into(), "a".into());
        assert_eq!(store.get("s1").as_deref(), Some("a"));
        store.update("s1", |v| *v = "b".into());
        assert_eq!(store.get("s1").as_deref(), Some("b"));
        assert!(store.get("missing").is_none());
    }

    #[test]
    fn gc_removes_expired() {
        let store = JobStore::<String>::new(Duration::from_millis(10));
        store.insert("old".into(), "x".into());
        std::thread::sleep(Duration::from_millis(30));
        store.gc();
        assert!(store.get("old").is_none());
    }
}
