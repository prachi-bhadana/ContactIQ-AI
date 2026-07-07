from sqlalchemy import Column, Integer, String
from database import Base


class Contact(Base):
    __tablename__ = "contacts"

    # ==========================
    # Primary Key
    # ==========================
    id = Column(Integer, primary_key=True, index=True)

    # ==========================
    # Personal Information
    # ==========================
    full_name = Column(String)
    first_name = Column(String)
    last_name = Column(String)

    gender = Column(String)
    marital_status = Column(String)
    date_of_birth = Column(String)
    nationality = Column(String)
    religion = Column(String)
    language = Column(String)

    # ==========================
    # Contact Information
    # ==========================
    email = Column(String)
    alternate_email = Column(String)

    phone = Column(String)
    alternate_phone = Column(String)

    website = Column(String)
    linkedin = Column(String)

    facebook = Column(String)
    instagram = Column(String)
    twitter = Column(String)
    youtube = Column(String)

    # ==========================
    # Address Information
    # ==========================
    current_address = Column(String)
    permanent_address = Column(String)

    city = Column(String)
    state = Column(String)
    country = Column(String)

    # ==========================
    # Professional Information
    # ==========================
    organization = Column(String)
    designation = Column(String)
    occupation = Column(String)
    industry = Column(String)

    experience_years = Column(String)
    experience_months = Column(String)

    primary_expertise = Column(String)
    alternate_expertise = Column(String)

    skills = Column(String)

    # ==========================
    # Educational Information
    # ==========================
    education = Column(String)

    # ==========================
    # Government Identification
    # ==========================
    pan = Column(String)
    aadhaar = Column(String)

    # ==========================
    # AI Processing Information
    # ==========================
    confidence = Column(Integer)
    processing_status = Column(String)

    # ==========================
    # Additional Notes
    # ==========================
    notes = Column(String)