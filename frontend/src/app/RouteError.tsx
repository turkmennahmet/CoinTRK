import { isRouteErrorResponse, Link, useRouteError } from 'react-router'

import styles from '../components/ui/ui.module.css'

export function RouteError() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404

  if (!notFound) console.error(error)

  return (
    <div className={styles.errorBox} role="alert" style={{ margin: '48px auto', maxWidth: 560 }}>
      <h2>{notFound ? 'Sayfa bulunamadı' : 'Bir şeyler ters gitti'}</h2>
      <p>
        {notFound
          ? 'Aradığınız sayfa mevcut değil.'
          : 'Sayfa yüklenirken beklenmeyen bir hata oluştu. Sayfayı yenilemeyi deneyin.'}
      </p>
      <Link to="/" className={styles.button}>
        Ana sayfaya dön
      </Link>
    </div>
  )
}
