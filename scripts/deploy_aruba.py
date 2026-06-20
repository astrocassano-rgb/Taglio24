import os
import sys
from ftplib import FTP

def load_env(env_path):
    env_vars = {}
    if not os.path.exists(env_path):
        return env_vars
    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                key, val = line.split('=', 1)
                env_vars[key.strip()] = val.strip()
    return env_vars

def main():
    # Carica le variabili da .env.local nella cartella root
    env_vars = load_env('.env.local')
    
    host = env_vars.get('ARUBA_FTP_HOST')
    user = env_vars.get('ARUBA_FTP_USER')
    passwd = env_vars.get('ARUBA_FTP_PASS')
    remote_dir = env_vars.get('ARUBA_FTP_DIR', 'public_html') # default a public_html
    
    if not host or not user or not passwd:
        print("Errore: Credenziali FTP non trovate in .env.local!")
        print("Assicurati di impostare le seguenti variabili nel file .env.local:")
        print("  ARUBA_FTP_HOST=...")
        print("  ARUBA_FTP_USER=...")
        print("  ARUBA_FTP_PASS=...")
        print("  ARUBA_FTP_DIR=public_html (opzionale, default: public_html)")
        sys.exit(1)
        
    local_dir = 'marketing-aruba'
    if not os.path.exists(local_dir):
        print(f"Errore: La cartella locale '{local_dir}' non esiste!")
        sys.exit(1)
        
    print(f"Connessione a {host} tramite FTP...")
    try:
        ftp = FTP(host)
        ftp.login(user, passwd)
        print("Connessione stabilita con successo!")
        print(f"Directory di atterraggio corrente (pwd): {ftp.pwd()}")
        print(f"Elenco dei file/cartelle presenti in questa directory:")
        try:
            print(ftp.nlst())
        except Exception as e_list:
            print(f"Impossibile elencare la directory: {e_list}")
    except Exception as e:
        print(f"Errore di connessione FTP: {e}")
        sys.exit(1)
        
    # Verifica/entra nella directory remota
    try:
        if remote_dir:
            print(f"Entro nella cartella remota: {remote_dir}")
            try:
                ftp.cwd(remote_dir)
            except Exception as e_cwd:
                print(f"Cartella remota '{remote_dir}' non trovata. Tentativo di crearla...")
                ftp.mkd(remote_dir)
                ftp.cwd(remote_dir)
        else:
            # Se è vuota, proviamo a vedere se esiste la cartella con il nome del dominio
            # Su Aruba, spesso si deve entrare in una cartella che si chiama come il dominio
            # o in 'public_html' o 'www.dogwash24.it'
            try:
                dirs = ftp.nlst()
                target_dir = None
                for d in dirs:
                    if 'dogwash24.it' in d.lower() or d.lower() == 'public_html' or d.lower() == 'www':
                        target_dir = d
                        break
                if target_dir:
                    print(f"Rilevata cartella remota per il dominio, entro in: {target_dir}")
                    ftp.cwd(target_dir)
            except Exception as e_detect:
                print(f"Impossibile rilevare la directory automatica: {e_detect}")
    except Exception as e:
        print(f"Errore durante la gestione della directory remota: {e}")
        ftp.quit()
        sys.exit(1)
            
    # Elenco dei file da caricare (escludiamo crop.py, README.md, .py, .md)
    files_to_upload = []
    for f in os.listdir(local_dir):
        path = os.path.join(local_dir, f)
        if os.path.isfile(path):
            if f.endswith('.py') or f.endswith('.md'):
                continue
            files_to_upload.append(f)
            
    print(f"Trovati {len(files_to_upload)} file da caricare.")
    
    for filename in files_to_upload:
        local_filepath = os.path.join(local_dir, filename)
        print(f"Caricamento di {filename}...", end='', flush=True)
        try:
            with open(local_filepath, 'rb') as fp:
                ftp.storbinary(f'STOR {filename}', fp)
            print(" Completato.")
        except Exception as e:
            print(f"\nErrore durante il caricamento di {filename}: {e}")
            
    try:
        ftp.quit()
    except:
        ftp.close()
    print("Deploy completato con successo!")

if __name__ == '__main__':
    main()
