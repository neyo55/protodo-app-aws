# ProTodo: Highly Available Cloud Architecture on AWS

## 📌 Project Overview
ProTodo is a production-grade, highly available task management web application. This project demonstrates modern Cloud and DevOps engineering practices, migrating a containerized Flask application to a robust, scalable, and secure AWS infrastructure managed entirely via Infrastructure as Code (IaC).



## 🛠️ Tech Stack & Tools
* **Cloud Provider:** Amazon Web Services (AWS), Cloudflare (DNS)
* **Infrastructure as Code:** Terraform
* **Backend:** Python, Flask, Gunicorn, PostgreSQL
* **Containerization:** Docker, Docker Compose V2
* **CI/CD:** GitHub Actions, AWS Systems Manager (SSM)
* **Monitoring:** Amazon CloudWatch, Prometheus (App Metrics)

## 🏗️ Architecture Deep Dive

### 1. Networking & Traffic Routing
* **Custom VPC:** Deployed a custom Virtual Private Cloud with public subnets spanning multiple Availability Zones (AZs) for high availability.
* **Application Load Balancer (ALB):** Distributes incoming web traffic across healthy EC2 instances. Configured with HTTP-to-HTTPS redirection and fully supports both IPv4 and IPv6 traffic.
* **DNS & SSL:** Integrated Cloudflare DNS with AWS Certificate Manager (ACM) to provision and attach SSL/TLS certificates for secure HTTPS connections (`app.neyothetechguy.com.ng`).

### 2. Compute & Auto-Scaling
* **Auto-Scaling Group (ASG):** Dynamically scales compute resources based on traffic demands using a custom EC2 Launch Template.
* **Stateless Servers:** Application instances act as disposable, stateless nodes. If a server becomes unhealthy, the ASG automatically terminates and replaces it.
* **Automated Bootstrapping:** Used EC2 `user_data` shell scripts to automatically install Docker, pull the latest application image, and configure system maintenance cron jobs (`/etc/cron.d`) upon instance initialization.

### 3. Decoupled Storage & Database
* **Managed Database:** Migrated from a local database to **Amazon RDS (PostgreSQL)**, completely decoupling stateful data from compute instances to prevent data loss during scaling events.
* **Object Storage (S3):** User-uploaded media (avatars) are directly streamed to Amazon S3. Configured Bucket Policies and Object Ownership Controls to ensure secure, scalable file serving.

### 4. Security & Identity
* **Secretless Deployments:** Eliminated all hardcoded AWS Access Keys (`.env`) from the application code. 
* **IAM Instance Profiles:** Secured AWS API calls by utilizing IAM Roles attached directly to the EC2 instances, granting the principle of least privilege for S3 and SSM access.
* **IMDSv2 Integration:** Modified EC2 metadata hop limits in Terraform to securely allow Docker containers to inherit host IAM credentials via the IMDSv2 service.

### 5. Automated Deployment (CI/CD)
* **Zero-Downtime Pipeline:** GitHub Actions automatically builds the Docker image, pushes it to Docker Hub, and triggers AWS Systems Manager (SSM) to securely execute a zero-downtime rolling update across the fleet.

## 🚀 Key Engineering Achievements
* Resolved complex Docker-to-AWS metadata networking (IMDSv2 hop limits) to secure S3 uploads without hardcoded keys.
* Engineered a dynamic routing architecture in Flask to support clean, extension-less URLs (`/login` instead of `login.html`).
* Implemented scheduled asynchronous tasks using APScheduler and Brevo SMTP for automated email reminders.