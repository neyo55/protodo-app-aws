
---

# ProTodo: Highly Available AWS Cloud Architecture & DevSecOps Pipeline

![Python](https://img.shields.io/badge/Python-3.10-blue)
![Flask](https://img.shields.io/badge/Flask-Backend-black)
![Docker](https://img.shields.io/badge/Docker-Containerized-blue)
![AWS](https://img.shields.io/badge/AWS-Cloud-orange)
![CI/CD](https://img.shields.io/badge/CI/CD-GitHub%20Actions-green)
![Security](https://img.shields.io/badge/Security-Trivy-red)
![DevSecOps](https://img.shields.io/badge/DevSecOps-Enabled-purple)
![Terraform](https://img.shields.io/badge/terraform-%235835CC.svg?style=for-the-badge&logo=terraform&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

---

**ProTodo** is a production-grade, containerized Task Management application deployed on a highly available, self-healing AWS infrastructure. ([ProTodo-Infrastructure](https://github.com/neyo55/protodo-infrastructure-aws.git))

This project demonstrates modern Cloud Engineering best practices, utilizing **Terraform** for Infrastructure as Code (IaC), **GitHub Actions** for a DevSecOps CI/CD pipeline, and a robust **AWS** architecture designed for security, resilience, and automated observability.

---

### The Application (ProTodo)

ProTodo is a full-stack web application built to manage daily tasks securely.

* **Frontend:** Responsive UI built with HTML5, CSS3, and Vanilla JavaScript.
* **Backend:** Python Flask API running on Gunicorn.
* **Features:** * JWT-based secure user authentication.
* Direct user avatar uploads to AWS S3.
* Email notification reminders via Sendinblue.
* Persistent relational data storage using PostgreSQL.

---

# Architecture Overview

The following diagram illustrates the flow of traffic, data, and automated monitoring across the AWS environment.

```mermaid
flowchart TB
    User((🧑‍💻 User))
    Cloudflare["☁️ Cloudflare DNS"]
    Admin((👨‍🔧 DevOps / You))

    subgraph AWS["AWS Cloud (Region: eu-central-1)"]
        direction TB
        
        S3["🪣 Amazon S3 (Avatars)"]
        SSM["🔐 SSM Parameter Store (.env Secrets)"]
        CW["📊 Amazon CloudWatch (Metrics)"]
        SNS["✉️ Amazon SNS (Alerts)"]
        Budgets["💰 AWS Budgets ($20 Limit)"]

        subgraph VPC["🌐 Custom VPC (10.0.0.0/16)"]
            direction TB
            ALB["⚖️ Application Load Balancer (HTTPS)"]

            subgraph ASG["⚙️ Auto Scaling Group (Public Subnets)"]
                direction LR
                EC2_1["🖥️ EC2 (Docker: Flask App)"]
                EC2_2["🖥️ EC2 (Docker: Flask App)"]
            end

            subgraph DB_Subnet["🗄️ DB Subnet Group"]
                RDS[("🐘 Amazon RDS (PostgreSQL)")]
            end

            ALB -->|Port 5000| EC2_1
            ALB -->|Port 5000| EC2_2
            EC2_1 -->|Port 5432| RDS
            EC2_2 -->|Port 5432| RDS
        end

        EC2_1 -->|Uploads via IMDSv2| S3
        EC2_2 -->|Uploads via IMDSv2| S3
        
        EC2_1 -.->|Decrypts at Boot| SSM
        EC2_2 -.->|Decrypts at Boot| SSM

        EC2_1 -.->|RAM/Disk Data| CW
        EC2_2 -.->|RAM/Disk Data| CW
        RDS -.->|CPU/Storage Data| CW
        ASG -.->|Scaling Events| SNS

        CW -->|Triggers Alarms| SNS
        Budgets -.->|Threshold Reached| SNS
    end

    User -->|HTTPS| Cloudflare
    Cloudflare -->|HTTPS| ALB
    SNS -->|Sends Email| Admin

```
---

### The Cloud Infrastructure (100% Terraform)

The environment is entirely provisioned using Terraform, ensuring an idempotent, version-controlled, and immutable infrastructure.

* **Networking & Traffic Routing:**
* Custom **VPC** with spread across multiple Availability Zones.
* **Application Load Balancer (ALB)** terminating SSL/TLS via **AWS ACM** and automatically redirecting HTTP (Port 80) to HTTPS (Port 443).
* Custom domain routing secured and proxied via **Cloudflare DNS**.


* **Compute & Auto-Scaling:**
* **Auto Scaling Group (ASG)** dynamically scaling `t3.micro` instances based on average CPU utilization (Target Tracking at 50%).
* Custom Launch Templates utilizing **IMDSv2** (Instance Metadata Service v2) for enhanced protection against SSRF attacks.


* **Data & Storage:**
* **Amazon RDS (PostgreSQL 13)** for secure, automated relational data management.
* **Amazon S3** bucket configured with strict Ownership Controls, public-read policies, and dynamic IAM injection for profile avatar uploads.


* **Security & IAM (Least Privilege):**
* Strict Security Groups ensuring EC2 instances only accept web traffic from the ALB, and RDS only accepts database traffic from the EC2 instances.
* **AWS Systems Manager (SSM) Parameter Store** heavily utilized to securely inject `.env` secrets dynamically into the EC2 instance at boot time via KMS decryption. No hardcoded secrets exist in the codebase.



---

## DevSecOps CI/CD Pipeline

Deployment is fully automated via GitHub Actions (`deploy.yml`). It enforces a strict "Quality Gate" before any code reaches production.

![Green GitHub Actions Pipeline](ProTodo-screenshots/github%20actions%20page.JPG)

1. **Quality & Security Gate (All Branches):**
* **Flake8:** Python syntax and style enforcement.
* **Bandit:** Static Application Security Testing (SAST) to find common security issues.
* **Safety:** Scans `requirements.txt` for known vulnerable dependencies.
* **Pytest:** Automated unit testing logic.


2. **Build & Container Scan (Staging/Prod):**
* Builds the Docker image locally.
* **Trivy:** Scans the local image for OS and library vulnerabilities. The pipeline is configured to **fail immediately** if CRITICAL or HIGH vulnerabilities are detected.
* Pushes the secured image to DockerHub.


3. **Zero-SSH Deployment (Prod):**
* Utilizes **AWS SSM Send-Command** to trigger rolling updates on the EC2 instances remotely. This eliminates the need to open SSH Port 22 to the public internet or manage fragile SSH keys in GitHub.



---

## Observability, Maintenance & FinOps

A production app isn't complete without monitoring and financial guardrails.

* **Deep EC2 Monitoring:** Installed the `amazon-cloudwatch-agent` via the bootstrap script to expose internal OS metrics (RAM and Disk space) that the default AWS hypervisor cannot see.
* **Proactive Alerting (SNS):** Terraform provisions CloudWatch Alarms to send email notifications for:
* RDS Storage running low (<2GB) or RAM dropping below 256MB.
* EC2 Disk Space exceeding 80% or Memory exceeding 70%.
* ASG Scaling events (Instance launches/terminations).


* **Automated Maintenance:** The EC2 `script.sh` injects a root cronjob that runs `docker system prune -af --filter "until=24h"` every day at **3:00 AM**. This prevents untagged/dangling Docker images from exhausting the EC2 root volume over time.
* **FinOps (Billing Alerts):** Configured **AWS Budgets** via Terraform to strictly monitor monthly spend. If the automated infrastructure costs reach 100% of the $40 limit, it instantly triggers an email alert, preventing surprise bills.

![Billing page](ProTodo-screenshots/AWS%20Billing%20page.JPG)

---

## Codebase Structure

```text
protodo-app-aws/
├── .github/workflows/     # CI/CD Pipeline configurations
│   └── deploy.yml         # Main workflow file
│
├── backend/               # Flask Application
│        ├── app.py                  # Main Flask app
│        ├── models.py               # Database models
│        ├── auth.py                 # Authentication routes
│        ├── todos.py                # Todo routes
│        ├── config.py               # Configuration
│        ├── requirements.txt        # Python dependencies
│        ├── wsgi.py
│        └── mailer.py              
│
├── Dockerfile
├── docker-compose.yml 
├── .env      # Dont upload it online.   
│               
│
├── frontend/              
│        ├── login.html              
│        ├── signup.html             
│        ├── app.html                
│        ├── style.css               
│        ├── forget-password.html
│        ├── reset-password.html     
│        └── script.js               
│
└── README.md              # This documentation

```

---
### Sample of env file

```text
# Database Credentials
POSTGRES_USER=as_desired
POSTGRES_PASSWORD=123456789
POSTGRES_DB=your_db_name

# Database configuration
# Format: postgresql://USER:PASSWORD@ENDPOINT:PORT/DB_NAME
DATABASE_URL=postgresql://as_desired:123456789@your-db-endpoint:5432/your_db_name


# Flask Security
SECRET_KEY=8f9c1a6e4b2d7f0c3e5a9b1d6c8e4f7a0b2c9d5e1a6f8c4b7d3e9a2

# Brevo Email Configuration
MAIL_SERVER=smtp-relay.brevo.com
MAIL_PORT=587
MAIL_USERNAME=xxxxxxxxx@smtp-brevo.com
MAIL_PASSWORD=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MAIL_DEFAULT_SENDER=abc123@abc.com

# AWS S3 Configuration
AWS_BUCKET_NAME=protodo-prod-storage
AWS_REGION=eu-xxxxxxx-1

```

---

## Lessons Learned & Technical Highlights

* **IMDSv2 and Docker Routing:** Securing EC2 metadata with `http_tokens = "required"` initially broke the `boto3` S3 upload functionality. 
**Solved it by increasing** the `http_put_response_hop_limit = 3` in the Launch Template, allowing Docker containers to successfully traverse the network bridge to retrieve AWS credentials safely.
* **Logging vs. Printing:** Transitioned from basic `print()` statements to Python's built-in `logging` module to ensure container **stdout/stderr** was properly captured by Docker's `json-file` driver and viewable via `docker logs`.
* **Idempotent Bootstrapping:** The `script.sh` is designed to be fully idempotent, safely tearing down old conflicting Docker packages before installing the official Docker CE, ensuring server replacements boot perfectly every time.


## Roadblocks & Technical Deep Dives

Building a production-ready environment is rarely straightforward. Here are two major technical challenges encountered during this deployment and how they were engineered away:

### 1. The "Ghost" Credentials: S3 Uploads Failing Inside Docker (IMDSv2 vs. Hop Limits)

**The Symptom:** The Flask application worked perfectly locally, but once deployed to the EC2 instances via Docker, user avatar uploads to S3 failed continuously with an `Unable to locate credentials` error in the terminal but users see `Upload failed` when trying to upload profile photo. This happened despite the EC2 instance having the correct IAM Role (`s3:PutObject`) attached.

**The Root Cause:** To harden the infrastructure against Server-Side Request Forgery (SSRF) attacks, the EC2 Launch Template was strictly configured to require **IMDSv2** (`http_tokens = "required"`).
However, Docker containers run on their own isolated virtual network bridge (`docker0`). When the `boto3` library inside the container tried to request the secure IMDSv2 token from the EC2 metadata IP (`169.254.169.254`), the request had to jump from the container network to the host network. Because the default AWS metadata response has a Time-To-Live (TTL) "hop limit" of exactly `1`, the return packet was dropped by the network before it could reach the container.

**The Fix:**

1. **Network Layer:** Updated the Terraform `aws_launch_template` to explicitly set `http_put_response_hop_limit = 3`. This allowed the metadata token packets to survive the extra routing hops across the Docker bridge.
2. **Application Layer:** Removed strict, outdated `boto3` version pinning in `requirements.txt` to ensure the container pulled the latest AWS SDK capable of natively negotiating the IMDSv2 protocol.

### 2. The IAM Illusion: S3 "AccessDenied" Despite Full Admin Rights

**The Symptom:** After fixing the container credential issue, the application successfully contacted S3 but was immediately hit with an `AccessDenied` exception when attempting to upload the `.jpg` profile pictures.

**The Root Cause:** The Python application was passing `ACL='public-read'` in the `boto3.put_object()` call so that frontend users could actually view their uploaded avatars. However, in recent years, AWS radically shifted its default S3 security posture. Modern S3 buckets are created with **"Block Public Access"** turned on globally, and Object ACLs disabled by default. Even though the EC2 IAM Role had absolute `s3:*` permissions, the bucket-level security protocols forcefully blocked the upload because the code requested a public ACL.

**The Fix:**
Instead of fighting the AWS security defaults manually in the console, the entire S3 security posture was refactored in Terraform (`s3.tf`):

1. **Bucket Ownership Controls:** Explicitly configured `aws_s3_bucket_ownership_controls` to `BucketOwnerPreferred` to re-enable ACL processing.
2. **Public Access Block:** Overrode the default lockdown by setting `block_public_acls = false` inside the `aws_s3_bucket_public_access_block` resource.
3. **Least-Privilege IAM:** Stripped the dangerous `AmazonS3FullAccess` policy from the EC2 instance and replaced it with a highly scoped inline IAM policy that only allows `PutObject`, `PutObjectAcl`, and `GetObject` strictly within the `protodo-prod-storage` bucket ARN.

---

# Author

**Rufai Adeniyi**

DevOps Engineer | Cloud Engineer | Automation

GitHub:
[https://github.com/neyo55](https://github.com/neyo55)

---

### Below are the screenshots of this project:

![Billing page](ProTodo-screenshots/signup%20page.JPG)

![Billing page](ProTodo-screenshots/login%20page.JPG)

![Billing page](ProTodo-screenshots/app%20page.JPG)

![Billing page](ProTodo-screenshots/app%20page-dark%20theme.JPG)

![Billing page](ProTodo-screenshots/dashboard%20page.JPG)

![Billing page](ProTodo-screenshots/dashboard%20page%20dark%20theme.JPG)

![Billing page](ProTodo-screenshots/Email%20notification.JPG)